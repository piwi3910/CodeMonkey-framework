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
import { existsSync } from 'fs';
import { resolve } from 'path';
import { LRUCache } from 'lru-cache';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CodeReviewIssue {
  description: string;
  severity: string;
  line?: number;
}

interface CodeReviewSuggestion {
  description: string;
  priority: string;
}

interface ProjectContext {
  id: string;
  name: string;
  description: string;
  [key: string]: any;
}

export class FrontendDeveloperAgent extends BaseAgent {
  private contextCache: LRUCache<string, ProjectContext>;
  private metrics: {
    codeReviews: number;
    improvements: number;
    successfulTasks: number;
    failedTasks: number;
  };

  constructor(
    protected readonly agentData: AgentData,
    sequelize: Sequelize,
    chroma: ChromaProvider,
    llm: OpenAIProvider
  ) {
    super(agentData, sequelize, chroma, llm);
    this.contextCache = new LRUCache<string, ProjectContext>({
      max: 100, // Maximum number of items
      ttl: CACHE_TTL,
    });
    this.metrics = {
      codeReviews: 0,
      improvements: 0,
      successfulTasks: 0,
      failedTasks: 0,
    };
  }

  public async chat(messages: Message[]): Promise<string> {
    const context = await this.getCachedProjectContext();
    const state = await this.getState();

    const systemPrompt = this.formatSystemPrompt({
      ...context,
      state,
    });

    const response = await this.retryLLMCall(async () => {
      return this.llm.chat([
        { role: 'system', content: systemPrompt },
        ...messages,
      ]);
    });

    return response.content;
  }

  public async reviewCode(filePath: string): Promise<CodeReviewResult> {
    // Validate file path
    const absolutePath = resolve(process.cwd(), filePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const context = await this.getCachedProjectContext();
    const fileContent = await this.readFile(absolutePath);

    const systemPrompt = this.formatSystemPrompt({
      ...context,
      filePath,
      fileContent,
    });

    const response = await this.retryLLMCall(async () => {
      return this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Review the code in ${filePath} for frontend best practices, accessibility, and performance.` },
      ]);
    });

    const review = await this.parseCodeReviewResponse(response.content);
    this.metrics.codeReviews++;

    return review;
  }

  public async suggestImprovements(context: string): Promise<ImprovementSuggestion[]> {
    const projectContext = await this.getCachedProjectContext();

    const systemPrompt = this.formatSystemPrompt({
      ...projectContext,
      improvementContext: context,
    });

    const response = await this.retryLLMCall(async () => {
      return this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Suggest improvements for the frontend implementation based on the provided context.' },
      ]);
    });

    const suggestions = await this.parseImprovementSuggestions(response.content);
    this.metrics.improvements++;

    return suggestions;
  }

  protected async executeTask(task: Task): Promise<TaskResult> {
    const context = await this.getCachedProjectContext();
    const state = await this.getState();

    const systemPrompt = this.formatSystemPrompt({
      ...context,
      state,
      task,
    });

    try {
      const response = await this.retryLLMCall(async () => {
        return this.llm.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: task.description },
        ]);
      });

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

      this.metrics.successfulTasks++;

      return {
        success: true,
        message: response.content,
      };
    } catch (error) {
      this.metrics.failedTasks++;
      throw error;
    }
  }

  public getMetrics() {
    return { ...this.metrics };
  }

  private async getCachedProjectContext(): Promise<ProjectContext> {
    const cacheKey = `context_${this.agentData.id}`;
    let context = this.contextCache.get(cacheKey);
    
    if (!context) {
      context = await this.getProjectContext() as ProjectContext;
      this.contextCache.set(cacheKey, context);
    }

    return context;
  }

  private async retryLLMCall<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return this.retryLLMCall(fn, retries - 1);
      }
      throw error;
    }
  }

  private async parseCodeReviewResponse(content: string): Promise<CodeReviewResult> {
    const review: CodeReviewResult = {
      issues: [],
      suggestions: [],
      score: 0,
      summary: '',
    };

    try {
      const parsedResponse = JSON.parse(content);
      if (parsedResponse && typeof parsedResponse === 'object') {
        if (Array.isArray(parsedResponse.issues)) {
          review.issues = parsedResponse.issues.map((issue: CodeReviewIssue) => ({
            description: String(issue.description || ''),
            severity: String(issue.severity || 'medium'),
            line: Number(issue.line) || undefined,
          }));
        }
        if (Array.isArray(parsedResponse.suggestions)) {
          review.suggestions = parsedResponse.suggestions.map((suggestion: CodeReviewSuggestion) => ({
            description: String(suggestion.description || ''),
            priority: String(suggestion.priority || 'medium'),
          }));
        }
        review.score = Number(parsedResponse.score) || 0;
        review.summary = String(parsedResponse.summary || '');
      }
    } catch (error) {
      console.error('Failed to parse code review response:', error);
      review.summary = content;
    }

    return review;
  }

  private async parseImprovementSuggestions(content: string): Promise<ImprovementSuggestion[]> {
    const suggestions: ImprovementSuggestion[] = [];

    try {
      const parsedResponse = JSON.parse(content);
      if (Array.isArray(parsedResponse)) {
        suggestions.push(...parsedResponse.map(suggestion => ({
          description: String(suggestion.description || suggestion),
          category: this.normalizeCategory(suggestion.category),
          priority: this.normalizePriority(suggestion.priority),
          effort: this.normalizeEffort(suggestion.effort),
          impact: this.normalizeImpact(suggestion.impact),
        })));
      }
    } catch (error) {
      console.error('Failed to parse improvement suggestions:', error);
      suggestions.push({
        description: content,
        category: 'performance',
        priority: 'medium',
        effort: 'medium',
        impact: 'medium',
      });
    }

    return suggestions;
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

  private normalizePriority(priority?: string): 'low' | 'medium' | 'high' {
    switch (priority?.toLowerCase()) {
      case 'low':
        return 'low';
      case 'high':
        return 'high';
      default:
        return 'medium';
    }
  }

  private normalizeEffort(effort?: string): 'low' | 'medium' | 'high' {
    switch (effort?.toLowerCase()) {
      case 'low':
        return 'low';
      case 'high':
        return 'high';
      default:
        return 'medium';
    }
  }

  private normalizeImpact(impact?: string): 'low' | 'medium' | 'high' {
    switch (impact?.toLowerCase()) {
      case 'low':
        return 'low';
      case 'high':
        return 'high';
      default:
        return 'medium';
    }
  }
}