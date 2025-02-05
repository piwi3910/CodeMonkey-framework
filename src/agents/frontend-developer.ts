import { PrismaClient, Task as PrismaTask } from '@prisma/client';
import { Redis } from 'ioredis';
import { BaseAgent } from './base';
import { LLMProvider } from '../providers/base';
import { Message, Task, TaskStatus } from '../types';
import { ChromaProvider } from '../providers/chroma';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FrontendDeveloperAgent extends BaseAgent {
  constructor(
    id: string,
    name: string,
    projectId: string,
    prisma: PrismaClient,
    redis: Redis,
    llm: LLMProvider,
    chroma: ChromaProvider
  ) {
    super(id, name, 'frontend_developer', projectId, prisma, redis, llm, chroma);
  }

  async processMessage(message: Message): Promise<Message> {
    await this.addToMemory(message, 'shortTerm');

    const relevantMemories = await this.getRelevantMemories(message.content);
    const projectContext = await this.getProjectContext();
    
    const conversationHistory: Message[] = [
      {
        role: 'system',
        content: this.getFrontendDevPrompt(projectContext),
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
    await this.processCodeChanges(responseMessage);

    return responseMessage;
  }

  async handleTask(task: Task): Promise<void> {
    await this.assignTask(task);

    await this.updateContext('currentTask', {
      id: task.id,
      title: task.title,
      description: task.description,
    });

    // Analyze task requirements
    const analysisPrompt: Message = {
      role: 'system',
      content: `Please analyze this frontend development task and break it down into steps:
Task: ${task.title}
Description: ${task.description}`,
    };

    const analysis = await this.processMessage(analysisPrompt);
    await this.updateContext('taskAnalysis', analysis.content);

    // Get existing code context if available
    const codeContext = await this.getCodeContext(task);
    if (codeContext) {
      await this.updateContext('codeContext', codeContext);
    }

    // Generate implementation plan
    const planPrompt: Message = {
      role: 'system',
      content: `Based on the analysis and code context, please create an implementation plan:
Analysis: ${analysis.content}
Code Context: ${codeContext || 'No existing code context'}`,
    };

    const plan = await this.processMessage(planPrompt);
    await this.updateContext('implementationPlan', plan.content);

    // Execute the implementation plan
    await this.executeImplementation(task, plan.content);

    await this.completeTask(task.id);
  }

  async planNextAction(): Promise<void> {
    const pendingTasks = await this.prisma.task.findMany({
      where: {
        projectId: this.projectId,
        status: 'pending',
        OR: [
          { title: { contains: 'frontend' } },
          { title: { contains: 'ui' } },
          { title: { contains: 'ux' } },
          { description: { contains: 'frontend' } },
          { description: { contains: 'ui' } },
          { description: { contains: 'ux' } },
        ],
      },
    });

    if (pendingTasks.length === 0) {
      return;
    }

    // Analyze and prioritize frontend tasks
    const analysisPrompt: Message = {
      role: 'system',
      content: `Please analyze these pending frontend tasks and prioritize them:
${pendingTasks.map((task) => `- ${task.title}\n  ${task.description}`).join('\n')}`,
    };

    const analysis = await this.processMessage(analysisPrompt);
    await this.updateContext('frontendPriorities', analysis.content);

    // Create implementation subtasks
    for (const task of pendingTasks) {
      await this.createImplementationTasks(task);
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

Design Requirements:
${projectContext.design}
    `;
  }

  private async getCodeContext(task: Task): Promise<string | null> {
    // Use ChromaDB to find relevant code
    const relevantCode = await this.chroma.findSimilarCode(
      `${task.title}\n${task.description}`,
      {
        projectId: this.projectId,
        nResults: 3,
      }
    );

    if (relevantCode.length === 0) {
      return null;
    }

    return relevantCode
      .map((doc) => `File: ${doc.metadata.filePath}\n\n${doc.content}`)
      .join('\n\n');
  }

  private async processCodeChanges(message: Message): Promise<void> {
    // Extract code blocks and file paths from the message
    const codeBlocks = message.content.match(/```[\s\S]*?```/g) || [];
    
    for (const block of codeBlocks) {
      const fileMatch = block.match(/```(\w+)\s*([^\n]*)\n([\s\S]*?)```/);
      if (fileMatch) {
        const [, language, filePath, code] = fileMatch;
        if (filePath && code) {
          await this.storeCodeChange({
            filePath,
            language,
            code: code.trim(),
            taskId: this.state.currentTask,
          });
        }
      }
    }
  }

  private async storeCodeChange(change: {
    filePath: string;
    language: string;
    code: string;
    taskId?: string;
  }): Promise<void> {
    // Store in ChromaDB for vector search
    await this.chroma.addCodeDocument(change.code, {
      filePath: change.filePath,
      language: change.language,
      projectId: this.projectId,
      taskId: change.taskId,
    });

    // Update project context
    const projectContext = await this.prisma.projectContext.findUnique({
      where: { projectId: this.projectId },
    });

    if (projectContext) {
      const technical = JSON.parse(projectContext.technical);
      technical.codeChanges = technical.codeChanges || [];
      technical.codeChanges.push({
        ...change,
        timestamp: new Date().toISOString(),
      });

      await this.prisma.projectContext.update({
        where: { projectId: this.projectId },
        data: {
          technical: JSON.stringify(technical),
        },
      });
    }
  }

  private async executeImplementation(task: Task, plan: string): Promise<void> {
    // Create implementation prompt with the plan
    const implementationPrompt: Message = {
      role: 'system',
      content: `Please implement the frontend changes according to this plan:
${plan}

Current task:
${task.title}
${task.description}

Please provide the implementation in code blocks with file paths.`,
    };

    const implementation = await this.processMessage(implementationPrompt);
    
    // Process and store the implementation
    await this.processCodeChanges(implementation);
  }

  private async createImplementationTasks(task: PrismaTask): Promise<void> {
    const implementationPrompt: Message = {
      role: 'system',
      content: `Please break down this frontend task into specific implementation tasks:
Task: ${task.title}
${task.description}`,
    };

    const response = await this.processMessage(implementationPrompt);

    // Create implementation tasks
    await this.prisma.task.create({
      data: {
        projectId: this.projectId,
        title: `Implement: ${task.title}`,
        description: response.content,
        status: 'pending' as TaskStatus,
        priority: task.priority,
        dependencies: JSON.stringify([task.id]),
      },
    });
  }

  private getFrontendDevPrompt(projectContext: string): string {
    return `${this.formatSystemPrompt()}

As a Frontend Developer agent, your responsibilities include:
1. Implementing user interfaces and interactions
2. Writing clean, maintainable frontend code
3. Following UI/UX design specifications
4. Ensuring responsive and accessible implementations
5. Integrating with backend APIs
6. Writing frontend tests

Current project context:
${projectContext}

Current agent context:
${JSON.stringify(this.state.context, null, 2)}

Please provide clear, well-structured frontend implementations with proper file organization and best practices.`;
  }
}