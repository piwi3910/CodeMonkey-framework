import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { LLMProvider } from '../providers/base';
import { AgentRole, AgentState, Message, Task } from '../types';
import { config } from '../config/env';
import { ChromaProvider } from '../providers/chroma';

interface AgentMemory {
  shortTerm: Message[];
  longTerm: Message[];
}

interface AgentContext {
  [key: string]: unknown;
}

const REDIS_STATE_TTL = config.agent.memoryTtl;
const REDIS_STATE_PREFIX = 'agent:state:';

export abstract class BaseAgent {
  protected prisma: PrismaClient;
  protected redis: Redis;
  protected llm: LLMProvider;
  protected chroma: ChromaProvider;
  protected state: {
    currentTask?: string;
    context: AgentContext;
    memory: AgentMemory;
  };

  constructor(
    protected id: string,
    protected name: string,
    protected role: AgentRole,
    protected projectId: string,
    prisma: PrismaClient,
    redis: Redis,
    llm: LLMProvider,
    chroma: ChromaProvider
  ) {
    this.prisma = prisma;
    this.redis = redis;
    this.llm = llm;
    this.chroma = chroma;
    this.state = {
      currentTask: undefined,
      context: {},
      memory: {
        shortTerm: [],
        longTerm: [],
      },
    };
  }

  // Core agent methods
  abstract processMessage(message: Message): Promise<Message>;
  abstract handleTask(task: Task): Promise<void>;
  abstract planNextAction(): Promise<void>;

  // State management
  protected async loadState(): Promise<void> {
    // Try to get state from Redis first
    const cachedState = await this.redis.get(this.getRedisStateKey());
    
    if (cachedState) {
      this.state = JSON.parse(cachedState);
      return;
    }

    // If not in Redis, load from database
    const agentState = await this.prisma.agentState.findUnique({
      where: { agentId: this.id },
    });

    if (agentState) {
      this.state = {
        currentTask: agentState.currentTask || undefined,
        context: JSON.parse(agentState.context) as AgentContext,
        memory: {
          shortTerm: JSON.parse(agentState.shortTerm) as Message[],
          longTerm: JSON.parse(agentState.longTerm) as Message[],
        },
      };

      // Cache the state in Redis
      await this.cacheState();
    }
  }

  protected async saveState(): Promise<void> {
    // Save to database
    await this.prisma.agentState.upsert({
      where: { agentId: this.id },
      update: {
        currentTask: this.state.currentTask,
        context: JSON.stringify(this.state.context),
        shortTerm: JSON.stringify(this.state.memory.shortTerm),
        longTerm: JSON.stringify(this.state.memory.longTerm),
      },
      create: {
        agentId: this.id,
        currentTask: this.state.currentTask,
        context: JSON.stringify(this.state.context),
        shortTerm: JSON.stringify(this.state.memory.shortTerm),
        longTerm: JSON.stringify(this.state.memory.longTerm),
      },
    });

    // Update Redis cache
    await this.cacheState();
  }

  private async cacheState(): Promise<void> {
    await this.redis.setex(
      this.getRedisStateKey(),
      REDIS_STATE_TTL,
      JSON.stringify(this.state)
    );
  }

  private getRedisStateKey(): string {
    return `${REDIS_STATE_PREFIX}${this.id}`;
  }

  // Memory management
  protected async addToMemory(message: Message, type: 'shortTerm' | 'longTerm'): Promise<void> {
    // Add to local state
    const memoryArray = this.state.memory[type];
    memoryArray.push(message);

    if (type === 'shortTerm') {
      // Keep only recent messages in short-term memory
      const maxShortTermMemory = 10;
      if (memoryArray.length > maxShortTermMemory) {
        this.state.memory.shortTerm = memoryArray.slice(-maxShortTermMemory);
      }
    }

    // Add to ChromaDB for vector search
    await this.chroma.addMemory(
      message.content,
      {
        agentId: this.id,
        projectId: this.projectId,
        type,
        timestamp: new Date().toISOString(),
      }
    );
    
    await this.saveState();
  }

  protected async clearShortTermMemory(): Promise<void> {
    this.state.memory.shortTerm = [];
    await this.saveState();
  }

  // Context management
  protected async updateContext(key: string, value: unknown): Promise<void> {
    this.state.context[key] = value;
    await this.saveState();
  }

  protected async clearContext(): Promise<void> {
    this.state.context = {};
    await this.saveState();
  }

  // Task management
  protected async assignTask(task: Task): Promise<void> {
    await this.prisma.task.update({
      where: { id: task.id },
      data: {
        agentId: this.id,
        status: 'in_progress',
      },
    });
    this.state.currentTask = task.id;
    await this.saveState();
  }

  protected async completeTask(taskId: string): Promise<void> {
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'completed',
      },
    });
    if (this.state.currentTask === taskId) {
      this.state.currentTask = undefined;
      await this.saveState();
    }
  }

  // Utility methods
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected formatSystemPrompt(): string {
    return `You are ${this.name}, a ${this.role} agent. Your current context is: ${JSON.stringify(this.state.context)}`;
  }

  protected async getRelevantMemories(query: string): Promise<Message[]> {
    // Use ChromaDB for semantic search
    const relevantMemories = await this.chroma.findRelevantMemories(query, {
      agentId: this.id,
      projectId: this.projectId,
      nResults: 5,
    });

    // Convert ChromaDB documents back to messages
    return relevantMemories.map(doc => {
      const metadata = doc.metadata;
      return {
        role: 'assistant',
        content: doc.content,
        timestamp: metadata.timestamp,
      };
    });
  }
}