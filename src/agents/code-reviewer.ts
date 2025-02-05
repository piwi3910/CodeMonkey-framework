import { PrismaClient, Task as PrismaTask } from '@prisma/client';
import { Redis } from 'ioredis';
import { BaseAgent } from './base';
import { LLMProvider } from '../providers/base';
import { Message, Task, TaskStatus } from '../types';
import { ChromaProvider } from '../providers/chroma';
import * as fs from 'fs/promises';
import * as path from 'path';

export class CodeReviewerAgent extends BaseAgent {
  constructor(
    id: string,
    name: string,
    projectId: string,
    prisma: PrismaClient,
    redis: Redis,
    llm: LLMProvider,
    chroma: ChromaProvider
  ) {
    super(id, name, 'code_reviewer', projectId, prisma, redis, llm, chroma);
  }

  async processMessage(message: Message): Promise<Message> {
    await this.addToMemory(message, 'shortTerm');

    const relevantMemories = await this.getRelevantMemories(message.content);
    const projectContext = await this.getProjectContext();
    
    const conversationHistory: Message[] = [
      {
        role: 'system',
        content: this.getCodeReviewerPrompt(projectContext),
      },
      ...relevantMemories,
      message,
    ];

    const response = await this.llm.chat(conversationHistory);

    const responseMessage: Message = {
      role: 'assistant',
      content: response.content,
    };

    await this.addToMemory(responseMessage, 'shortTerm');
    await this.processReviewComments(responseMessage);

    return responseMessage;
  }

  async handleTask(task: Task): Promise<void> {
    await this.assignTask(task);

    await this.updateContext('currentTask', {
      id: task.id,
      title: task.title,
      description: task.description,
    });

    // Get code context for review
    const codeContext = await this.getCodeContext(task);
    if (codeContext) {
      await this.updateContext('codeContext', codeContext);
    }

    // Analyze code and provide review
    const reviewPrompt: Message = {
      role: 'system',
      content: `Please review this code:
${codeContext || 'No code context available'}

Focus on:
1. Code quality and best practices
2. Potential bugs and issues
3. Security concerns
4. Performance considerations
5. Maintainability and readability
6. Test coverage

Task context:
${task.title}
${task.description}`,
    };

    const review = await this.processMessage(reviewPrompt);
    await this.storeReviewFeedback(task, review.content);

    // Create tasks for addressing review feedback
    await this.createFeedbackTasks(task, review.content);

    await this.completeTask(task.id);
  }

  async planNextAction(): Promise<void> {
    const pendingTasks = await this.prisma.task.findMany({
      where: {
        projectId: this.projectId,
        status: 'pending',
        OR: [
          { title: { contains: 'review' } },
          { description: { contains: 'review' } },
          { title: { contains: 'quality' } },
          { description: { contains: 'quality' } },
        ],
      },
    });

    if (pendingTasks.length === 0) {
      return;
    }

    // Analyze and prioritize review tasks
    const analysisPrompt: Message = {
      role: 'system',
      content: `Please analyze these pending code review tasks and prioritize them:
${pendingTasks.map((task) => `- ${task.title}\n  ${task.description}`).join('\n')}`,
    };

    const analysis = await this.processMessage(analysisPrompt);
    await this.updateContext('reviewPriorities', analysis.content);

    // Create review subtasks
    for (const task of pendingTasks) {
      await this.createReviewTasks(task);
    }
  }

  private async getProjectContext(): Promise<string> {
    const projectContext = await this.prisma.projectContext.findUnique({
      where: { projectId: this.projectId },
    });

    if (!projectContext) {
      return 'No project context available.';
    }

    return `
Project Architecture:
${projectContext.architecture}

Technical Documentation:
${projectContext.technical}

Code Standards:
${this.extractCodeStandards(projectContext.technical)}
    `;
  }

  private extractCodeStandards(technical: string): string {
    try {
      const techData = JSON.parse(technical);
      return techData.codeStandards || 'No code standards defined.';
    } catch {
      return 'No code standards defined.';
    }
  }

  private async getCodeContext(task: Task): Promise<string | null> {
    // Use ChromaDB to find relevant code
    const relevantCode = await this.chroma.findSimilarCode(
      `${task.title}\n${task.description}`,
      {
        projectId: this.projectId,
        nResults: 5,
      }
    );

    if (relevantCode.length === 0) {
      return null;
    }

    return relevantCode
      .map((doc) => `File: ${doc.metadata.filePath}\n\n${doc.content}`)
      .join('\n\n');
  }

  private async processReviewComments(message: Message): Promise<void> {
    // Extract review comments and store them
    const comments = this.extractReviewComments(message.content);
    
    if (comments.length > 0) {
      await this.storeReviewComments(comments);
    }
  }

  private extractReviewComments(content: string): Array<{
    type: 'issue' | 'suggestion' | 'praise';
    comment: string;
    file?: string;
    line?: number;
  }> {
    const comments: Array<{
      type: 'issue' | 'suggestion' | 'praise';
      comment: string;
      file?: string;
      line?: number;
    }> = [];

    // Extract comments using regex patterns
    const issuePattern = /Issue:([^]*?)(?=Issue:|Suggestion:|Praise:|$)/g;
    const suggestionPattern = /Suggestion:([^]*?)(?=Issue:|Suggestion:|Praise:|$)/g;
    const praisePattern = /Praise:([^]*?)(?=Issue:|Suggestion:|Praise:|$)/g;

    // Process issues
    let match;
    while ((match = issuePattern.exec(content)) !== null) {
      const [, comment] = match;
      const fileMatch = comment.match(/File: (.*?)(?:\n|$)/);
      const lineMatch = comment.match(/Line: (\d+)/);

      comments.push({
        type: 'issue',
        comment: comment.trim(),
        file: fileMatch?.[1],
        line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      });
    }

    // Process suggestions
    while ((match = suggestionPattern.exec(content)) !== null) {
      const [, comment] = match;
      const fileMatch = comment.match(/File: (.*?)(?:\n|$)/);
      const lineMatch = comment.match(/Line: (\d+)/);

      comments.push({
        type: 'suggestion',
        comment: comment.trim(),
        file: fileMatch?.[1],
        line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      });
    }

    // Process praise
    while ((match = praisePattern.exec(content)) !== null) {
      const [, comment] = match;
      const fileMatch = comment.match(/File: (.*?)(?:\n|$)/);
      const lineMatch = comment.match(/Line: (\d+)/);

      comments.push({
        type: 'praise',
        comment: comment.trim(),
        file: fileMatch?.[1],
        line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      });
    }

    return comments;
  }

  private async storeReviewComments(comments: Array<{
    type: 'issue' | 'suggestion' | 'praise';
    comment: string;
    file?: string;
    line?: number;
  }>): Promise<void> {
    const projectContext = await this.prisma.projectContext.findUnique({
      where: { projectId: this.projectId },
    });

    if (projectContext) {
      const technical = JSON.parse(projectContext.technical);
      technical.codeReviews = technical.codeReviews || {};
      technical.codeReviews[this.state.currentTask!] = {
        comments,
        timestamp: new Date().toISOString(),
      };

      await this.prisma.projectContext.update({
        where: { projectId: this.projectId },
        data: {
          technical: JSON.stringify(technical),
        },
      });
    }
  }

  private async storeReviewFeedback(task: Task, feedback: string): Promise<void> {
    // Store review feedback in ChromaDB
    await this.chroma.addDocumentation(
      feedback,
      {
        projectId: this.projectId,
        type: 'technical',
        title: `Code Review: ${task.title}`,
        timestamp: new Date().toISOString(),
      }
    );
  }

  private async createFeedbackTasks(task: Task, feedback: string): Promise<void> {
    const taskCreationPrompt: Message = {
      role: 'system',
      content: `Please create specific tasks to address this review feedback:
${feedback}

Original task:
${task.title}
${task.description}`,
    };

    const response = await this.processMessage(taskCreationPrompt);

    // Create tasks for addressing feedback
    await this.prisma.task.create({
      data: {
        projectId: this.projectId,
        title: `Address Review Feedback: ${task.title}`,
        description: response.content,
        status: 'pending' as TaskStatus,
        priority: task.priority,
        dependencies: JSON.stringify([task.id]),
      },
    });
  }

  private async createReviewTasks(task: PrismaTask): Promise<void> {
    const reviewTaskPrompt: Message = {
      role: 'system',
      content: `Please break down this code review task into specific review tasks:
Task: ${task.title}
${task.description}`,
    };

    const response = await this.processMessage(reviewTaskPrompt);

    // Create review tasks
    await this.prisma.task.create({
      data: {
        projectId: this.projectId,
        title: `Review: ${task.title}`,
        description: response.content,
        status: 'pending' as TaskStatus,
        priority: task.priority,
        dependencies: JSON.stringify([task.id]),
      },
    });
  }

  private getCodeReviewerPrompt(projectContext: string): string {
    return `${this.formatSystemPrompt()}

As a Code Reviewer agent, your responsibilities include:
1. Reviewing code for quality and best practices
2. Identifying potential bugs and issues
3. Assessing security vulnerabilities
4. Evaluating performance implications
5. Ensuring maintainability and readability
6. Checking test coverage
7. Providing constructive feedback

Current project context:
${projectContext}

Current agent context:
${JSON.stringify(this.state.context, null, 2)}

Please provide detailed, constructive code review feedback using this format:
Issue: [Description of the issue]
File: [File path]
Line: [Line number]
[Detailed explanation]

Suggestion: [Description of the suggestion]
File: [File path]
Line: [Line number]
[Detailed explanation]

Praise: [Description of good practices found]
File: [File path]
Line: [Line number]
[Detailed explanation]`;
  }
}