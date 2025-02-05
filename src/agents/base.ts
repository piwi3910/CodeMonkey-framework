import { PrismaClient } from '@prisma/client';
import { ChromaProvider } from '../providers/chroma';
import { OpenAIProvider } from '../providers/openai';
import { Message } from '../types';

export interface AgentData {
  id: string;
  name: string;
  role: string;
  projectId: string;
  provider: string;
  model: string;
  systemPrompt: string;
}

export abstract class BaseAgent {
  protected id: string;
  protected name: string;
  protected role: string;
  protected projectId: string;
  protected provider: string;
  protected model: string;
  protected systemPrompt: string;

  constructor(
    data: AgentData,
    protected prisma: PrismaClient,
    protected chroma: ChromaProvider,
    protected llm: OpenAIProvider
  ) {
    this.id = data.id;
    this.name = data.name;
    this.role = data.role;
    this.projectId = data.projectId;
    this.provider = data.provider;
    this.model = data.model;
    this.systemPrompt = data.systemPrompt;
  }

  // Public getters for agent properties
  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public getRole(): string {
    return this.role;
  }

  public getProjectId(): string {
    return this.projectId;
  }

  public getProvider(): string {
    return this.provider;
  }

  public getModel(): string {
    return this.model;
  }

  public getSystemPrompt(): string {
    return this.systemPrompt;
  }

  // Core agent functionality
  abstract chat(messages: Message[]): Promise<string>;
  abstract handleTask(taskId: string): Promise<void>;
  abstract reviewCode(filePath: string): Promise<string>;
  abstract suggestImprovements(context: string): Promise<string>;

  // State management
  protected async loadState(): Promise<void> {
    const state = await this.prisma.agentState.findUnique({
      where: { agentId: this.id },
    });

    if (!state) {
      await this.prisma.agentState.create({
        data: {
          agentId: this.id,
          context: '{}',
          shortTerm: '[]',
          longTerm: '[]',
        },
      });
    }
  }

  protected async saveState(
    context: string,
    shortTerm: string,
    longTerm: string
  ): Promise<void> {
    await this.prisma.agentState.update({
      where: { agentId: this.id },
      data: {
        context,
        shortTerm,
        longTerm,
      },
    });
  }

  // Memory management
  protected async memorize(
    content: string,
    type: 'shortTerm' | 'longTerm',
    metadata: Record<string, any>
  ): Promise<void> {
    await this.chroma.addMemory(content, {
      source: this.role,
      type: type === 'shortTerm' ? 'short_term' : 'long_term',
      tags: [this.role, type],
      relatedMemories: [],
      agentId: this.id,
      projectId: this.projectId,
    });
  }

  protected async recall(
    query: string,
    type?: 'shortTerm' | 'longTerm'
  ): Promise<string[]> {
    const memories = await this.chroma.findRelevantMemories(query, {
      agentId: this.id,
      projectId: this.projectId,
      type: type ? (type === 'shortTerm' ? 'short_term' : 'long_term') : undefined,
    });

    return memories.map(m => m.content);
  }

  // Learning management
  protected async recordSuccess(taskId: string): Promise<void> {
    // Record successful task completion
    await this.prisma.learningProfile.update({
      where: { agentId: this.id },
      data: {
        totalTasks: { increment: 1 },
        successfulTasks: { increment: 1 },
      },
    });
  }

  protected async recordFailure(taskId: string): Promise<void> {
    // Record task failure
    await this.prisma.learningProfile.update({
      where: { agentId: this.id },
      data: {
        totalTasks: { increment: 1 },
        failedTasks: { increment: 1 },
      },
    });
  }

  // Utility methods
  protected async getProjectContext(): Promise<Record<string, any>> {
    const context = await this.prisma.projectContext.findUnique({
      where: { projectId: this.projectId },
    });

    return context ? {
      architecture: JSON.parse(context.architecture),
      technical: JSON.parse(context.technical),
      requirements: JSON.parse(context.requirements),
      dependencies: JSON.parse(context.dependencies),
    } : {};
  }

  protected async updateProjectContext(
    key: 'architecture' | 'technical' | 'requirements' | 'dependencies',
    value: Record<string, any>
  ): Promise<void> {
    await this.prisma.projectContext.update({
      where: { projectId: this.projectId },
      data: {
        [key]: JSON.stringify(value),
      },
    });
  }
}