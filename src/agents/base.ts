import { Sequelize } from 'sequelize';
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
} from '../types';
import { Agent, AgentState, Task as TaskModel, Project, ProjectContext } from '../models';

interface ProjectContextData {
  architecture: string;
  technical: string;
  requirements: string;
  dependencies: string;
}

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
    protected sequelize: Sequelize,
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

  public async handleTask(task: Task): Promise<TaskResult> {
    try {
      // Update task status
      await TaskModel.update(
        { status: TaskStatus.InProgress },
        { where: { id: task.id } }
      );

      // Load agent state
      await this.loadState();

      // Execute task
      const result = await this.executeTask(task);

      // Update task status based on result
      await TaskModel.update(
        { status: result.success ? TaskStatus.Completed : TaskStatus.Failed },
        { where: { id: task.id } }
      );

      // Record task outcome
      if (result.success) {
        await this.recordSuccess(task.id);
      } else {
        await this.recordFailure(task.id);
      }

      return result;
    } catch (error) {
      // Handle task failure
      await TaskModel.update(
        { status: TaskStatus.Failed },
        { where: { id: task.id } }
      );

      await this.recordFailure(task.id);

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
      prompt += '\n\nContext:\n' + JSON.stringify(context, null, 2);
    }

    return prompt;
  }

  protected async loadState(): Promise<void> {
    const state = await AgentState.findOne({
      where: { agentId: this.id },
    });

    if (!state) {
      await AgentState.create({
        agentId: this.id,
        context: '{}',
        shortTerm: '[]',
        longTerm: '[]',
      });
    }
  }

  protected async getState(): Promise<Record<string, any>> {
    const state = await AgentState.findOne({
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

  protected async saveState(state: Record<string, any>): Promise<void> {
    await AgentState.update(
      {
        context: JSON.stringify(state.context || {}),
        shortTerm: JSON.stringify(state.shortTerm || []),
        longTerm: JSON.stringify(state.longTerm || []),
        currentTask: state.currentTask,
      },
      { where: { agentId: this.id } }
    );
  }

  protected async getProjectContext(): Promise<Record<string, any>> {
    const project = await Project.findByPk(this.projectId, {
      include: [{
        model: ProjectContext,
        as: 'context',
        required: true,
      }],
    });

    if (!project || !project.get('context')) {
      throw new Error('Project context not found');
    }

    const context = project.get('context') as unknown as ProjectContextData;

    return {
      architecture: JSON.parse(context.architecture),
      technical: JSON.parse(context.technical),
      requirements: JSON.parse(context.requirements),
      dependencies: JSON.parse(context.dependencies),
      project,
    };
  }

  protected async updateProjectContext(
    key: string,
    value: Record<string, any>
  ): Promise<void> {
    const context = await ProjectContext.findOne({
      where: { projectId: this.projectId },
    });

    if (!context) {
      throw new Error('Project context not found');
    }

    await context.update({
      [key]: JSON.stringify(value),
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
    const agent = await Agent.findByPk(this.id);
    if (agent) {
      await agent.increment(['totalTasks', 'successfulTasks']);
    }
  }

  private async recordFailure(taskId: string): Promise<void> {
    const agent = await Agent.findByPk(this.id);
    if (agent) {
      await agent.increment(['totalTasks', 'failedTasks']);
    }
  }
}