import { v4 as uuidv4 } from 'uuid';
import {
  Memory,
  MemoryLevel,
  MemoryType,
  MemoryImportance,
  MemoryMetadata,
  MemoryQuery,
  MemoryStats,
  MemoryConfig,
  ConsolidationResult,
  ConsolidationRule,
  MemorySearchResult,
} from './types';
import { ChromaProvider } from '../providers/chroma';
import { OpenAIProvider } from '../providers/openai';
import { config } from '../config/env';
import { DocumentationType } from '../types';

export class MemoryManager {
  private readonly defaultConfig: MemoryConfig = {
    maxWorkingMemories: 10,
    maxShortTermMemories: 100,
    workingMemoryTTL: 5 * 60 * 1000, // 5 minutes
    shortTermMemoryTTL: 24 * 60 * 60 * 1000, // 24 hours
    consolidationInterval: 60 * 60 * 1000, // 1 hour
    minImportanceForLongTerm: MemoryImportance.Medium,
    similarityThreshold: 0.7,
    consolidationRules: [
      {
        sourceLevel: MemoryLevel.WorkingMemory,
        targetLevel: MemoryLevel.ShortTerm,
        conditions: {
          minImportance: MemoryImportance.Low,
          minAccessCount: 2,
          minAge: 5 * 60 * 1000, // 5 minutes
        },
        transformations: {
          summarize: true,
          combineRelated: true,
        },
      },
      {
        sourceLevel: MemoryLevel.ShortTerm,
        targetLevel: MemoryLevel.LongTerm,
        conditions: {
          minImportance: MemoryImportance.Medium,
          minAccessCount: 5,
          minAge: 12 * 60 * 60 * 1000, // 12 hours
        },
        transformations: {
          summarize: true,
          combineRelated: true,
          extractPatterns: true,
          generalizeKnowledge: true,
        },
      },
    ],
  };

  private consolidationTimer!: NodeJS.Timeout;

  constructor(
    private chroma: ChromaProvider,
    private openai: OpenAIProvider,
    private config: MemoryConfig = this.defaultConfig
  ) {
    this.startConsolidation();
  }

  async addMemory(
    content: string,
    metadata: MemoryMetadata,
    level: MemoryLevel = MemoryLevel.WorkingMemory,
    importance: MemoryImportance = MemoryImportance.Low
  ): Promise<Memory> {
    const memory: Memory = {
      id: uuidv4(),
      content,
      level,
      importance,
      timestamp: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
      metadata,
    };

    // Generate embeddings
    memory.embeddings = await this.generateEmbeddings(content);

    // Store in ChromaDB
    await this.storeMemory(memory);

    // Check capacity limits
    await this.enforceCapacityLimits(level, metadata.agentId);

    return memory;
  }

  async queryMemories(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const searchResults = await this.chroma.findRelevantDocumentation(
      query.content || '',
      {
        projectId: query.metadata?.projectId || '',
        type: 'memory' as DocumentationType,
        nResults: query.limit,
      }
    );

    return searchResults.map(doc => {
      const memory = JSON.parse(doc.content) as Memory;
      return {
        memory,
        similarity: doc.metadata.similarity || 0,
        context: doc.metadata.context,
      };
    }).filter(result => {
      // Apply filters
      if (query.level && result.memory.level !== query.level) return false;
      if (query.type && result.memory.metadata.type !== query.type) return false;
      if (query.importance && result.memory.importance < query.importance) return false;
      if (query.timeRange) {
        const timestamp = new Date(result.memory.timestamp);
        if (timestamp < query.timeRange.start || timestamp > query.timeRange.end) {
          return false;
        }
      }
      if (query.tags) {
        const hasAllTags = query.tags.every(tag => 
          result.memory.metadata.tags.includes(tag)
        );
        if (!hasAllTags) return false;
      }
      if (query.similarityThreshold && result.similarity < query.similarityThreshold) {
        return false;
      }
      return true;
    });
  }

  async getMemoryStats(agentId: string): Promise<MemoryStats> {
    const memories = await this.getAllMemories(agentId);
    
    const stats: MemoryStats = {
      totalMemories: memories.length,
      byLevel: Object.fromEntries(
        Object.values(MemoryLevel).map(level => [level, 0])
      ) as Record<MemoryLevel, number>,
      byType: Object.fromEntries(
        Object.values(MemoryType).map(type => [type, 0])
      ) as Record<MemoryType, number>,
      byImportance: Object.fromEntries(
        Object.values(MemoryImportance).filter(Number.isInteger).map(imp => [imp, 0])
      ) as Record<MemoryImportance, number>,
      averageAccessCount: 0,
      consolidationRate: 0,
      retentionRate: 0,
    };

    // Calculate stats
    let totalAccessCount = 0;
    memories.forEach(memory => {
      stats.byLevel[memory.level]++;
      stats.byType[memory.metadata.type]++;
      stats.byImportance[memory.importance]++;
      totalAccessCount += memory.accessCount;
    });

    stats.averageAccessCount = totalAccessCount / memories.length;

    // Calculate consolidation and retention rates
    const recentMemories = memories.filter(m => 
      new Date().getTime() - new Date(m.timestamp).getTime() < 24 * 60 * 60 * 1000
    );
    const consolidatedMemories = recentMemories.filter(m => 
      m.level === MemoryLevel.LongTerm
    );
    
    stats.consolidationRate = consolidatedMemories.length / recentMemories.length;
    stats.retentionRate = memories.filter(m => m.accessCount > 1).length / memories.length;

    return stats;
  }

  private async startConsolidation(): Promise<void> {
    this.consolidationTimer = setInterval(
      async () => {
        try {
          await this.consolidateMemories();
        } catch (error) {
          console.error('Memory consolidation error:', error);
        }
      },
      this.config.consolidationInterval
    );
  }

  private async consolidateMemories(): Promise<void> {
    for (const rule of this.config.consolidationRules) {
      const memories = await this.getMemoriesForConsolidation(rule);
      
      // Group related memories
      const groups = this.groupRelatedMemories(memories);

      for (const group of groups) {
        try {
          const result = await this.applyConsolidationRule(group, rule);
          await this.storeConsolidatedMemory(result);
        } catch (error) {
          console.error('Consolidation error:', error);
        }
      }
    }
  }

  private async getMemoriesForConsolidation(rule: ConsolidationRule): Promise<Memory[]> {
    const minTimestamp = new Date(Date.now() - rule.conditions.minAge);
    
    const memories = await this.queryMemories({
      level: rule.sourceLevel,
      importance: rule.conditions.minImportance,
      timeRange: {
        start: minTimestamp,
        end: new Date(),
      },
      tags: rule.conditions.requiredTags,
    });

    return memories
      .map(r => r.memory)
      .filter(m => m.accessCount >= rule.conditions.minAccessCount);
  }

  private groupRelatedMemories(memories: Memory[]): Memory[][] {
    const groups: Memory[][] = [];
    const used = new Set<string>();

    for (const memory of memories) {
      if (used.has(memory.id)) continue;

      const group = [memory];
      used.add(memory.id);

      // Find related memories
      for (const other of memories) {
        if (used.has(other.id)) continue;

        const isRelated = this.areMemoriesRelated(memory, other);
        if (isRelated) {
          group.push(other);
          used.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private async applyConsolidationRule(
    memories: Memory[],
    rule: ConsolidationRule
  ): Promise<ConsolidationResult> {
    let consolidatedContent = '';
    
    if (rule.transformations.summarize) {
      consolidatedContent = await this.summarizeMemories(memories);
    }
    
    if (rule.transformations.extractPatterns) {
      const patterns = await this.extractPatterns(memories);
      consolidatedContent += `\n\nPatterns identified:\n${patterns}`;
    }
    
    if (rule.transformations.generalizeKnowledge) {
      const knowledge = await this.generalizeKnowledge(memories);
      consolidatedContent += `\n\nGeneralized knowledge:\n${knowledge}`;
    }

    const newMemory: Memory = {
      id: uuidv4(),
      content: consolidatedContent,
      level: rule.targetLevel,
      importance: Math.max(...memories.map(m => m.importance)),
      timestamp: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
      metadata: {
        source: 'consolidation',
        type: MemoryType.Knowledge,
        tags: [...new Set(memories.flatMap(m => m.metadata.tags))],
        relatedMemories: memories.map(m => m.id),
        agentId: memories[0].metadata.agentId,
        projectId: memories[0].metadata.projectId,
      },
      embeddings: await this.generateEmbeddings(consolidatedContent),
    };

    return {
      sourceMemories: memories.map(m => m.id),
      newMemory,
      level: rule.targetLevel,
      summary: consolidatedContent,
    };
  }

  private async summarizeMemories(memories: Memory[]): Promise<string> {
    const content = memories.map(m => m.content).join('\n\n');
    const response = await this.openai.chat([
      {
        role: 'system',
        content: 'Summarize the following memories, preserving key information and insights:',
      },
      {
        role: 'user',
        content,
      },
    ]);
    return response.content;
  }

  private async extractPatterns(memories: Memory[]): Promise<string> {
    const content = memories.map(m => m.content).join('\n\n');
    const response = await this.openai.chat([
      {
        role: 'system',
        content: 'Identify recurring patterns and common themes in these memories:',
      },
      {
        role: 'user',
        content,
      },
    ]);
    return response.content;
  }

  private async generalizeKnowledge(memories: Memory[]): Promise<string> {
    const content = memories.map(m => m.content).join('\n\n');
    const response = await this.openai.chat([
      {
        role: 'system',
        content: 'Extract general principles and reusable knowledge from these experiences:',
      },
      {
        role: 'user',
        content,
      },
    ]);
    return response.content;
  }

  private areMemoriesRelated(a: Memory, b: Memory): boolean {
    // Check metadata
    if (a.metadata.taskId && a.metadata.taskId === b.metadata.taskId) return true;
    if (a.metadata.relatedMemories.includes(b.id)) return true;
    
    // Check tags overlap
    const commonTags = a.metadata.tags.filter(tag => b.metadata.tags.includes(tag));
    if (commonTags.length >= 2) return true;

    // Check embeddings similarity if available
    if (a.embeddings && b.embeddings) {
      const similarity = this.calculateCosineSimilarity(a.embeddings, b.embeddings);
      if (similarity >= this.config.similarityThreshold) return true;
    }

    return false;
  }

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  private async generateEmbeddings(content: string): Promise<number[]> {
    // Use OpenAI's embedding API
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.llm.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: content,
        model: 'text-embedding-3-small',
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate embeddings');
    }

    const result = await response.json() as { data: [{ embedding: number[] }] };
    return result.data[0].embedding;
  }

  private async storeMemory(memory: Memory): Promise<void> {
    await this.chroma.addDocumentation(
      JSON.stringify(memory),
      {
        projectId: memory.metadata.agentId,
        type: 'memory' as DocumentationType,
        title: `Memory: ${memory.id}`,
        timestamp: memory.timestamp.toISOString(),
        tags: ['memory', memory.level, memory.metadata.type, ...memory.metadata.tags],
      }
    );
  }

  private async storeConsolidatedMemory(result: ConsolidationResult): Promise<void> {
    await this.storeMemory(result.newMemory);

    // Archive source memories
    for (const id of result.sourceMemories) {
      // Mark as consolidated in metadata
      const memory = await this.getMemory(id);
      if (memory) {
        memory.metadata.tags.push('consolidated');
        await this.storeMemory(memory);
      }
    }
  }

  private async enforceCapacityLimits(level: MemoryLevel, agentId: string): Promise<void> {
    if (level === MemoryLevel.WorkingMemory) {
      const memories = await this.queryMemories({
        level: MemoryLevel.WorkingMemory,
        metadata: { agentId },
      });

      if (memories.length > this.config.maxWorkingMemories) {
        // Consolidate oldest memories
        const oldestMemories = memories
          .map(r => r.memory)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
          .slice(0, memories.length - this.config.maxWorkingMemories);

        for (const memory of oldestMemories) {
          await this.consolidateMemory(memory);
        }
      }
    }
  }

  private async consolidateMemory(memory: Memory): Promise<void> {
    const rule = this.config.consolidationRules.find(r => 
      r.sourceLevel === memory.level
    );

    if (rule) {
      const result = await this.applyConsolidationRule([memory], rule);
      await this.storeConsolidatedMemory(result);
    }
  }

  private async getMemory(id: string): Promise<Memory | null> {
    const results = await this.chroma.findRelevantDocumentation(
      `memory:${id}`,
      {
        projectId: 'system',
        type: 'memory' as DocumentationType,
      }
    );

    if (results.length === 0) return null;

    try {
      return JSON.parse(results[0].content) as Memory;
    } catch {
      return null;
    }
  }

  private async getAllMemories(agentId: string): Promise<Memory[]> {
    const results = await this.chroma.findRelevantDocumentation(
      'type:memory',
      {
        projectId: agentId,
        type: 'memory' as DocumentationType,
      }
    );

    return results
      .map(doc => {
        try {
          return JSON.parse(doc.content) as Memory;
        } catch {
          return null;
        }
      })
      .filter((m): m is Memory => m !== null);
  }

  stop(): void {
    if (this.consolidationTimer) {
      clearTimeout(this.consolidationTimer);
    }
  }
}