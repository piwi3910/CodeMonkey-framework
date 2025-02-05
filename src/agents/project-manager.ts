import { PrismaClient, Task as PrismaTask } from '@prisma/client';
import { Redis } from 'ioredis';
import { BaseAgent } from './base';
import { LLMProvider } from '../providers/base';
import { ChromaProvider } from '../providers/chroma';
import { Message, Task, TaskStatus, TaskPriority } from '../types';

export class ProjectManagerAgent extends BaseAgent {
  constructor(
    id: string,
    name: string,
    projectId: string,
    prisma: PrismaClient,
    redis: Redis,
    llm: LLMProvider,
    chroma: ChromaProvider
  ) {
    super(id, name, 'project_manager', projectId, prisma, redis, llm, chroma);
  }

  async processMessage(message: Message): Promise<Message> {
    await this.addToMemory(message, 'shortTerm');

    const relevantMemories = await this.getRelevantMemories(message.content);
    const projectContext = await this.getProjectContext();
    
    const conversationHistory: Message[] = [
      {
        role: 'system',
        content: this.getProjectManagerPrompt(projectContext),
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
    await this.processActions(responseMessage);

    return responseMessage;
  }

  async handleTask(task: Task): Promise<void> {
    await this.assignTask(task);

    await this.updateContext('currentTask', {
      id: task.id,
      title: task.title,
      description: task.description,
    });

    // Process the task
    const taskMessage: Message = {
      role: 'system',
      content: `New task assigned: ${task.title}\n${task.description}`,
    };

    await this.processMessage(taskMessage);
    await this.completeTask(task.id);
  }

  async planNextAction(): Promise<void> {
    const prismaTasks = await this.prisma.task.findMany({
      where: {
        projectId: this.projectId,
        status: 'pending',
      },
      orderBy: {
        priority: 'desc',
      },
    });

    const pendingTasks = prismaTasks.map(this.mapPrismaTaskToTask);

    if (pendingTasks.length === 0) {
      return;
    }

    // Analyze tasks and create a plan
    const planningPrompt: Message = {
      role: 'system',
      content: `Please analyze these pending tasks and create a plan:\n${pendingTasks
        .map(
          (task) => `- ${task.title} (Priority: ${task.priority})\n  ${task.description}`
        )
        .join('\n')}`,
    };

    const plan = await this.processMessage(planningPrompt);

    // Update project context with the plan
    await this.updateContext('currentPlan', plan.content);

    // Store plan in ChromaDB for future reference
    await this.chroma.addDocumentation(
      plan.content,
      {
        projectId: this.projectId,
        type: 'technical',
        title: 'Project Plan',
        timestamp: new Date().toISOString(),
      }
    );

    // Assign tasks based on the plan
    for (const task of pendingTasks) {
      await this.assignTaskToAgent(task);
    }
  }

  private async getProjectContext(): Promise<string> {
    const projectContext = await this.prisma.projectContext.findUnique({
      where: { projectId: this.projectId },
    });

    if (!projectContext) {
      return 'No project context available.';
    }

    // Get relevant documentation from ChromaDB
    const relevantDocs = await this.chroma.findRelevantDocumentation(
      'project plan technical requirements architecture',
      {
        projectId: this.projectId,
        nResults: 3,
      }
    );

    const docs = relevantDocs.length > 0
      ? '\n\nRelevant Documentation:\n' + relevantDocs
          .map(doc => `${doc.metadata.title}\n${doc.content}`)
          .join('\n\n')
      : '';

    return `
Project Architecture:
${projectContext.architecture}

Technical Documentation:
${projectContext.technical}

Requirements:
${projectContext.requirements}
${docs}
    `;
  }

  private async assignTaskToAgent(task: Task): Promise<void> {
    const agents = await this.prisma.agent.findMany({
      where: {
        projectId: this.projectId,
        NOT: {
          role: 'project_manager',
        },
      },
    });

    if (agents.length === 0) {
      return;
    }

    // Get relevant task history from ChromaDB
    const taskHistory = await this.chroma.findRelevantDocumentation(
      `${task.title}\n${task.description}`,
      {
        projectId: this.projectId,
        nResults: 3,
      }
    );

    const assignmentPrompt: Message = {
      role: 'system',
      content: `Please assign this task to the most appropriate agent:
Task: ${task.title}
Description: ${task.description}

Available agents:
${agents.map((agent) => `- ${agent.name} (${agent.role})`).join('\n')}

Relevant task history:
${taskHistory.map(doc => doc.content).join('\n\n')}`,
    };

    const response = await this.processMessage(assignmentPrompt);

    const chosenAgent = agents.find((agent) =>
      response.content.toLowerCase().includes(agent.role.toLowerCase())
    );

    if (chosenAgent) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          agentId: chosenAgent.id,
          status: 'assigned' as TaskStatus,
        },
      });

      // Store assignment decision in ChromaDB
      await this.chroma.addDocumentation(
        `Task "${task.title}" assigned to ${chosenAgent.name} (${chosenAgent.role})\n\nReasoning:\n${response.content}`,
        {
          projectId: this.projectId,
          type: 'technical',
          title: `Task Assignment: ${task.title}`,
          timestamp: new Date().toISOString(),
        }
      );
    }
  }

  private async processActions(message: Message): Promise<void> {
    if (message.content.toLowerCase().includes('create task')) {
      const task = await this.prisma.task.create({
        data: {
          projectId: this.projectId,
          title: 'New task from PM',
          description: message.content,
          status: 'pending' as TaskStatus,
          priority: 'medium' as TaskPriority,
          dependencies: '[]',
        },
      });

      // Store task creation in ChromaDB
      await this.chroma.addDocumentation(
        `Task created:\nTitle: ${task.title}\nDescription: ${task.description}`,
        {
          projectId: this.projectId,
          type: 'technical',
          title: `Task Creation: ${task.title}`,
          timestamp: new Date().toISOString(),
        }
      );
    }
  }

  private getProjectManagerPrompt(projectContext: string): string {
    return `${this.formatSystemPrompt()}

As a Project Manager agent, your responsibilities include:
1. Analyzing and breaking down project requirements
2. Creating and assigning tasks to appropriate agents
3. Monitoring project progress and adjusting plans
4. Coordinating between different agents
5. Ensuring project goals are met

Current project context:
${projectContext}

Current agent context:
${JSON.stringify(this.state.context, null, 2)}

Please provide clear, actionable responses and always consider the project's overall goals.`;
  }

  private mapPrismaTaskToTask(prismaTask: PrismaTask): Task {
    return {
      ...prismaTask,
      status: prismaTask.status as TaskStatus,
      priority: prismaTask.priority as TaskPriority,
      dependencies: JSON.parse(prismaTask.dependencies),
    };
  }
}