/**
 * Types for the hierarchical memory system
 */

export enum MemoryLevel {
  WorkingMemory = 'working_memory',  // Immediate task context
  ShortTerm = 'short_term',          // Recent experiences
  LongTerm = 'long_term',            // Consolidated knowledge
  Episodic = 'episodic',             // Past experiences
  Semantic = 'semantic',             // General knowledge
}

export enum MemoryImportance {
  Low = 1,
  Medium = 2,
  High = 3,
  Critical = 4,
}

export enum MemoryType {
  Observation = 'observation',      // Direct observations
  Inference = 'inference',          // Derived insights
  Decision = 'decision',            // Past decisions
  Knowledge = 'knowledge',          // Learned information
  Experience = 'experience',        // Task experiences
  Feedback = 'feedback',           // User feedback
  Error = 'error',                 // Past mistakes
  Success = 'success',             // Successful outcomes
  Collaboration = 'collaboration',  // Team interactions
  Context = 'context',             // Environmental context
}

export interface Memory {
  id: string;
  content: string;
  level: MemoryLevel;
  importance: MemoryImportance;
  timestamp: Date;
  lastAccessed: Date;
  accessCount: number;
  metadata: MemoryMetadata;
  embeddings?: number[];  // Vector embeddings for similarity search
}

export interface MemoryMetadata {
  source: string;
  type: MemoryType;
  context?: string;
  tags: string[];
  relatedMemories: string[];  // IDs of related memories
  agentId: string;
  taskId?: string;
  projectId: string;
}

export interface ConsolidationRule {
  sourceLevel: MemoryLevel;
  targetLevel: MemoryLevel;
  conditions: {
    minImportance: MemoryImportance;
    minAccessCount: number;
    minAge: number;  // milliseconds
    requiredTags?: string[];
    requiredTypes?: MemoryType[];
  };
  transformations: {
    summarize?: boolean;
    combineRelated?: boolean;
    extractPatterns?: boolean;
    generalizeKnowledge?: boolean;
  };
}

export interface MemoryQuery {
  content?: string;
  level?: MemoryLevel;
  type?: MemoryType;
  importance?: MemoryImportance;
  timeRange?: {
    start: Date;
    end: Date;
  };
  metadata?: Partial<MemoryMetadata>;
  tags?: string[];
  limit?: number;
  similarityThreshold?: number;
}

export interface MemoryStats {
  totalMemories: number;
  byLevel: Record<MemoryLevel, number>;
  byType: Record<MemoryType, number>;
  byImportance: Record<MemoryImportance, number>;
  averageAccessCount: number;
  consolidationRate: number;
  retentionRate: number;
}

export interface ConsolidationResult {
  sourceMemories: string[];  // IDs of consolidated memories
  newMemory: Memory;
  level: MemoryLevel;
  summary?: string;
}

export interface MemoryConfig {
  maxWorkingMemories: number;
  maxShortTermMemories: number;
  workingMemoryTTL: number;  // milliseconds
  shortTermMemoryTTL: number;  // milliseconds
  consolidationInterval: number;  // milliseconds
  minImportanceForLongTerm: MemoryImportance;
  similarityThreshold: number;  // 0-1 range
  consolidationRules: ConsolidationRule[];
}

export interface MemorySearchResult {
  memory: Memory;
  similarity: number;  // 0-1 range
  context?: string;
}