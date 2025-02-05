import { PrismaClient } from '@prisma/client';
import { ChromaProvider } from '../providers/chroma';
import { OpenAIProvider } from '../providers/openai';
import { 
  Message, 
  Task, 
  TaskResult,
  TaskStatus,
  TaskPriority,
  CodeReviewResult,
  ImprovementSuggestion,
  DocumentationType,
  AgentState,
  ProjectContext,
} from '../types';

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

  // Public getters
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

  // Core functionality
  public abstract chat(messages: Message[]): Promise<string>;

  public async handleTask(taskId: string): Promise<TaskResult> {
    const dbTask = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!dbTask) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const task: Task = {
      id: dbTask.id,
      title: dbTask.title,
      description: dbTask.description,
      status: dbTask.status as TaskStatus,
      priority: dbTask.priority as TaskPriority,
      dependencies: JSON.parse(dbTask.dependencies),
      projectId: dbTask.projectId,
      agentId: dbTask.agentId,
      createdAt: dbTask.createdAt,
      updatedAt: dbTask.updatedAt,
    };

    try {
      // Update task status
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.InProgress },
      });

      // Load agent state
      await this.loadState();

      // Execute task
      const result = await this.executeTask(task);

      // Update task status based on result
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: result.success ? TaskStatus.Completed : TaskStatus.Failed,
        },
      });

      // Record task outcome
      if (result.success) {
        await this.recordSuccess(taskId);
      } else {
        await this.recordFailure(taskId);
      }

      return result;
    } catch (error) {
      // Handle task failure
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.Failed },
      });

      await this.recordFailure(taskId);

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  public abstract reviewCode(filePath: string): Promise<CodeReviewResult>;

  public abstract suggestImprovements(context: string): Promise<ImprovementSuggestion[]>;

  // Protected helper methods
  protected abstract executeTask(task: Task): Promise<TaskResult>;

  protected formatSystemPrompt(context?: Record<string, any>): string {
    let prompt = this.systemPrompt;

    if (context) {
      // Add context to system prompt
      prompt += '\n\nContext:\n' + JSON.stringify(context, null, 2);
    }

    return prompt;
  }

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

  protected async getState(): Promise<AgentState> {
    const state = await this.prisma.agentState.findUnique({
      where: { agentId: this.id },
    });

    if (!state) {
      throw new Error('Agent state not found');
    }

    return {
      context: JSON.parse(state.context),
      shortTerm: JSON.parse(state.shortTerm),
      longTerm: JSON.parse(state.longTerm),
      currentTask: state.currentTask,
    };
  }

  protected async saveState(state: AgentState): Promise<void> {
    await this.prisma.agentState.update({
      where: { agentId: this.id },
      data: {
        context: JSON.stringify(state.context),
        shortTerm: JSON.stringify(state.shortTerm),
        longTerm: JSON.stringify(state.longTerm),
        currentTask: state.currentTask,
      },
    });
  }

  protected async getProjectContext(): Promise<ProjectContext> {
    const context = await this.prisma.projectContext.findUnique({
      where: { projectId: this.projectId },
    });

    if (!context) {
      throw new Error('Project context not found');
    }

    return {
      architecture: JSON.parse(context.architecture),
      technical: JSON.parse(context.technical),
      requirements: JSON.parse(context.requirements),
      dependencies: JSON.parse(context.dependencies),
    };
  }

  protected async updateProjectContext(
    key: keyof ProjectContext,
    value: Record<string, any>
  ): Promise<void> {
    await this.prisma.projectContext.update({
      where: { projectId: this.projectId },
      data: {
        [key]: JSON.stringify(value),
      },
    });
  }

  protected async memorize(
    content: string,
    type: DocumentationType,
    metadata: Record<string, any>
  ): Promise<void> {
    await this.chroma.addDocumentation(content, {
      projectId: this.projectId,
      type,
      title: `Memory: ${type}`,
      timestamp: new Date().toISOString(),
      tags: [type, this.role, ...Object.keys(metadata)],
      ...metadata,
    });
  }

  protected async recall(
    query: string,
    type?: DocumentationType,
    limit?: number
  ): Promise<string[]> {
    const results = await this.chroma.findRelevantDocumentation(query, {
      projectId: this.projectId,
      type,
      nResults: limit,
    });

    return results.map(r => r.content);
  }

  private async recordSuccess(taskId: string): Promise<void> {
    await this.prisma.agent.update({
      where: { id: this.id },
      data: {
        learningProfile: {
          upsert: {
            create: {
              totalTasks: 1,
              successfulTasks: 1,
              failedTasks: 0,
              averageMetrics: '{}',
              learningRate: 1,
            },
            update: {
              totalTasks: { increment: 1 },
              successfulTasks: { increment: 1 },
            },
          },
        },
      },
    });
  }

  private async recordFailure(taskId: string): Promise<void> {
    await this.prisma.agent.update({
      where: { id: this.id },
      data: {
        learningProfile: {
          upsert: {
            create: {
              totalTasks: 1,
              successfulTasks: 0,
              failedTasks: 1,
              averageMetrics: '{}',
              learningRate: 1,
            },
            update: {
              totalTasks: { increment: 1 },
              failedTasks: { increment: 1 },
            },
          },
        },
      },
    });
  }
}