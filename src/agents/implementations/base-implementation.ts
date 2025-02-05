import { PrismaClient } from '@prisma/client';
import { ChromaProvider } from '../../providers/chroma';
import { OpenAIProvider } from '../../providers/openai';
import { BaseAgent, AgentData } from '../base';
import {
  Message,
  Task,
  TaskResult,
  CodeReviewResult,
  ImprovementSuggestion,
} from '../../types';

export abstract class BaseAgentImplementation extends BaseAgent {
  constructor(
    data: AgentData,
    prisma: PrismaClient,
    chroma: ChromaProvider,
    llm: OpenAIProvider
  ) {
    super(data, prisma, chroma, llm);
  }

  public async chat(messages: Message[]): Promise<string> {
    const context = await this.getProjectContext();
    const systemMessage: Message = {
      role: 'system',
      content: this.formatSystemPrompt(context),
    };

    const response = await this.llm.chat([systemMessage, ...messages]);
    return response.content;
  }

  public async reviewCode(filePath: string): Promise<CodeReviewResult> {
    const context = await this.getProjectContext();
    const fileContent = await this.chroma.findRelevantDocumentation(
      `file:${filePath}`,
      { projectId: this.projectId }
    );

    if (!fileContent.length) {
      throw new Error(`File not found: ${filePath}`);
    }

    const response = await this.llm.chat([
      {
        role: 'system',
        content: this.formatSystemPrompt({
          ...context,
          task: 'code_review',
          file: filePath,
        }),
      },
      {
        role: 'user',
        content: `Review this code:\n\n${fileContent[0].content}`,
      },
    ]);

    const review = JSON.parse(response.content) as CodeReviewResult;
    return review;
  }

  public async suggestImprovements(context: string): Promise<ImprovementSuggestion[]> {
    const projectContext = await this.getProjectContext();
    const response = await this.llm.chat([
      {
        role: 'system',
        content: this.formatSystemPrompt({
          ...projectContext,
          task: 'suggest_improvements',
        }),
      },
      {
        role: 'user',
        content: `Suggest improvements for:\n\n${context}`,
      },
    ]);

    const suggestions = JSON.parse(response.content) as ImprovementSuggestion[];
    return suggestions;
  }

  protected async executeTask(task: Task): Promise<TaskResult> {
    // Load relevant context
    const context = await this.getProjectContext();
    const memories = await this.recall(
      `task:${task.id} ${task.title} ${task.description}`,
      'technical'
    );

    // Generate execution plan
    const planResponse = await this.llm.chat([
      {
        role: 'system',
        content: this.formatSystemPrompt({
          ...context,
          memories,
          task: 'execution_plan',
        }),
      },
      {
        role: 'user',
        content: `Create execution plan for task:\n${JSON.stringify(task, null, 2)}`,
      },
    ]);

    const plan = JSON.parse(planResponse.content) as {
      steps: string[];
      estimatedDuration: number;
    };

    // Execute each step
    const artifacts: string[] = [];
    for (const step of plan.steps) {
      const stepResponse = await this.llm.chat([
        {
          role: 'system',
          content: this.formatSystemPrompt({
            ...context,
            memories,
            task: 'execute_step',
            plan,
            currentStep: step,
          }),
        },
        {
          role: 'user',
          content: `Execute step: ${step}`,
        },
      ]);

      // Store step result
      await this.memorize(
        stepResponse.content,
        'technical',
        {
          taskId: task.id,
          step,
          timestamp: new Date().toISOString(),
        }
      );

      artifacts.push(stepResponse.content);
    }

    return {
      success: true,
      message: 'Task completed successfully',
      artifacts,
      metrics: {
        duration: Date.now() - task.createdAt.getTime(),
        resourceUsage: 0.8,
        quality: 0.9,
      },
    };
  }

  protected abstract customizeSystemPrompt(context: Record<string, any>): string;

  protected formatSystemPrompt(context?: Record<string, any>): string {
    let prompt = this.systemPrompt;

    if (context) {
      prompt += '\n\nContext:\n' + JSON.stringify(context, null, 2);
      prompt += '\n\n' + this.customizeSystemPrompt(context);
    }

    return prompt;
  }
}