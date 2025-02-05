import { PrismaClient, Task as PrismaTask } from '@prisma/client';
import { Redis } from 'ioredis';
import { BaseAgent } from './base';
import { LLMProvider } from '../providers/base';
import { Message, Task, TaskStatus } from '../types';

export class ArchitectAgent extends BaseAgent {
  constructor(
    id: string,
    name: string,
    projectId: string,
    prisma: PrismaClient,
    redis: Redis,
    llm: LLMProvider
  ) {
    super(id, name, 'architect', projectId, prisma, redis, llm);
  }

  async processMessage(message: Message): Promise<Message> {
    await this.addToMemory(message, 'shortTerm');

    const relevantMemories = await this.getRelevantMemories(message.content);
    const projectContext = await this.getProjectContext();
    
    const conversationHistory: Message[] = [
      {
        role: 'system',
        content: this.getArchitectPrompt(projectContext),
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
    await this.processArchitecturalDecisions(responseMessage);

    return responseMessage;
  }

  async handleTask(task: Task): Promise<void> {
    await this.assignTask(task);

    // Update context with current task
    await this.updateContext('currentTask', {
      id: task.id,
      title: task.title,
      description: task.description,
    });

    // Process architectural task
    const taskMessage: Message = {
      role: 'system',
      content: `Please analyze and provide architectural guidance for: ${task.title}\n${task.description}`,
    };

    const response = await this.processMessage(taskMessage);
    
    // Store architectural decision
    await this.storeArchitecturalDecision({
      title: task.title,
      description: task.description,
      decision: response.content,
      taskId: task.id,
    });

    await this.completeTask(task.id);
  }

  async planNextAction(): Promise<void> {
    const pendingDecisions = await this.prisma.task.findMany({
      where: {
        projectId: this.projectId,
        status: 'pending',
        OR: [
          { title: { contains: 'architecture' } },
          { title: { contains: 'design' } },
          { description: { contains: 'architecture' } },
          { description: { contains: 'design' } },
        ],
      },
    });

    if (pendingDecisions.length === 0) {
      return;
    }

    // Analyze and prioritize architectural decisions
    const analysisPrompt: Message = {
      role: 'system',
      content: `Please analyze these pending architectural decisions and prioritize them:
${pendingDecisions.map((task) => `- ${task.title}\n  ${task.description}`).join('\n')}`,
    };

    const analysis = await this.processMessage(analysisPrompt);
    await this.updateContext('architecturalPriorities', analysis.content);

    // Create subtasks for implementation
    for (const decision of pendingDecisions) {
      await this.createImplementationTasks(decision);
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

Dependencies:
${projectContext.dependencies}
    `;
  }

  private async processArchitecturalDecisions(message: Message): Promise<void> {
    // Extract and store architectural decisions from the message
    if (message.content.toLowerCase().includes('architectural decision:')) {
      const decision = {
        title: 'Architectural Decision',
        description: message.content,
        decision: message.content,
        taskId: this.state.currentTask,
      };

      await this.storeArchitecturalDecision(decision);
    }
  }

  private async storeArchitecturalDecision(decision: {
    title: string;
    description: string;
    decision: string;
    taskId?: string;
  }): Promise<void> {
    // Update project context with the new architectural decision
    const projectContext = await this.prisma.projectContext.findUnique({
      where: { projectId: this.projectId },
    });

    if (projectContext) {
      const architecture = JSON.parse(projectContext.architecture);
      architecture.decisions = architecture.decisions || [];
      architecture.decisions.push({
        ...decision,
        timestamp: new Date().toISOString(),
      });

      await this.prisma.projectContext.update({
        where: { projectId: this.projectId },
        data: {
          architecture: JSON.stringify(architecture),
        },
      });
    }
  }

  private async createImplementationTasks(decision: PrismaTask): Promise<void> {
    const implementationPrompt: Message = {
      role: 'system',
      content: `Please break down this architectural decision into implementation tasks:
Decision: ${decision.title}
${decision.description}`,
    };

    const response = await this.processMessage(implementationPrompt);

    // Create implementation tasks
    await this.prisma.task.create({
      data: {
        projectId: this.projectId,
        title: `Implement: ${decision.title}`,
        description: response.content,
        status: 'pending' as TaskStatus,
        priority: decision.priority,
        dependencies: JSON.stringify([decision.id]),
      },
    });
  }

  private getArchitectPrompt(projectContext: string): string {
    return `${this.formatSystemPrompt()}

As an Architect agent, your responsibilities include:
1. Making high-level technical decisions
2. Designing system architecture
3. Ensuring technical consistency
4. Evaluating technical trade-offs
5. Providing architectural guidance to other agents

Current project context:
${projectContext}

Current agent context:
${JSON.stringify(this.state.context, null, 2)}

Please provide clear, well-reasoned architectural decisions and guidance.`;
  }
}