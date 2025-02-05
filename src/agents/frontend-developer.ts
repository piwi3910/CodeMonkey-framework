import { Sequelize } from 'sequelize';
import { ChromaProvider } from '../providers/chroma';
import { OpenAIProvider } from '../providers/openai';
import { AgentData, BaseAgent } from './base';
import { 
  Message,
  Task,
  TaskResult,
  CodeReviewResult,
  ImprovementSuggestion,
  TaskStatus,
} from '../types';
import { Task as TaskModel } from '../models';

export class FrontendDeveloperAgent extends BaseAgent {
  constructor(
    data: AgentData,
    sequelize: Sequelize,
    chroma: ChromaProvider,
    llm: OpenAIProvider
  ) {
    super(data, sequelize, chroma, llm);
  }

  public async chat(messages: Message[]): Promise<string> {
    const context = await this.getProjectContext();
    const state = await this.getState();

    const systemPrompt = this.formatSystemPrompt({
      ...context,
      state,
    });

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      ...messages,
    ]);

    return response.content;
  }

  public async reviewCode(filePath: string): Promise<CodeReviewResult> {
    const context = await this.getProjectContext();
    const fileContent = await this.readFile(filePath);

    const systemPrompt = this.formatSystemPrompt({
      ...context,
      filePath,
      fileContent,
    });

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Review the code in ${filePath} for frontend best practices, accessibility, and performance.` },
    ]);

    const review: CodeReviewResult = {
      issues: [],
      suggestions: [],
      score: 0,
      summary: '',
    };

    try {
      const parsedResponse = JSON.parse(response.content);
      if (parsedResponse && typeof parsedResponse === 'object') {
        if (Array.isArray(parsedResponse.issues)) {
          review.issues = parsedResponse.issues;
        }
        if (Array.isArray(parsedResponse.suggestions)) {
          review.suggestions = parsedResponse.suggestions;
        }
        if (typeof parsedResponse.score === 'number') {
          review.score = parsedResponse.score;
        }
        if (typeof parsedResponse.summary === 'string') {
          review.summary = parsedResponse.summary;
        }
      }
    } catch (error) {
      console.error('Failed to parse code review response:', error);
      review.summary = response.content;
    }

    return review;
  }

  public async suggestImprovements(context: string): Promise<ImprovementSuggestion[]> {
    const projectContext = await this.getProjectContext();

    const systemPrompt = this.formatSystemPrompt({
      ...projectContext,
      improvementContext: context,
    });

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Suggest improvements for the frontend implementation based on the provided context.' },
    ]);

    const suggestions: ImprovementSuggestion[] = [];

    try {
      const parsedResponse = JSON.parse(response.content);
      if (Array.isArray(parsedResponse)) {
        suggestions.push(...parsedResponse.map(suggestion => ({
          description: suggestion.description || suggestion,
          category: this.normalizeCategory(suggestion.category),
          priority: suggestion.priority || 'medium',
          effort: suggestion.effort || 'medium',
          impact: suggestion.impact || 'medium',
        })));
      }
    } catch (error) {
      console.error('Failed to parse improvement suggestions:', error);
      suggestions.push({
        description: response.content,
        category: 'performance',
        priority: 'medium',
        effort: 'medium',
        impact: 'medium',
      });
    }

    return suggestions;
  }

  protected async executeTask(task: Task): Promise<TaskResult> {
    const context = await this.getProjectContext();
    const state = await this.getState();

    const systemPrompt = this.formatSystemPrompt({
      ...context,
      state,
      task,
    });

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task.description },
    ]);

    // Update task status
    await TaskModel.update(
      { status: TaskStatus.Completed },
      { where: { id: task.id } }
    );

    // Update agent state
    await this.saveState({
      ...state,
      currentTask: null,
      shortTerm: [...state.shortTerm, {
        type: 'task',
        id: task.id,
        description: task.description,
        result: response.content,
        timestamp: new Date().toISOString(),
      }],
    });

    return {
      success: true,
      message: response.content,
    };
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      const fs = await import('fs/promises');
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  private normalizeCategory(category?: string): 'performance' | 'security' | 'maintainability' | 'architecture' {
    switch (category?.toLowerCase()) {
      case 'performance':
        return 'performance';
      case 'security':
        return 'security';
      case 'maintainability':
        return 'maintainability';
      case 'architecture':
        return 'architecture';
      default:
        return 'maintainability';
    }
  }
}