import { PrismaClient, Task as PrismaTask } from '@prisma/client';
import { Redis } from 'ioredis';
import { BaseAgent } from './base';
import { LLMProvider } from '../providers/base';
import { Message, Task, TaskStatus, TaskPriority } from '../types';

export class ProjectManagerAgent extends BaseAgent {
  constructor(
    id: string,
    name: string,
    projectId: string,
    prisma: PrismaClient,
    redis: Redis,
    llm: LLMProvider
  ) {
    super(id, name, 'project_manager', projectId, prisma, redis, llm);
  }

  async processMessage(message: Message): Promise<Message> {
    // Add message to short-term memory
    await this.addToMemory(message, 'shortTerm');

    // Get relevant context from memory
    const relevantMemories = await this.getRelevantMemories(message.content);
    
    // Prepare conversation history
    const conversationHistory: Message[] = [
      {
        role: 'system',
        content: this.getProjectManagerPrompt(),
      },
      ...relevantMemories,
      message,
    ];

    // Get response from LLM
    const response = await this.llm.chat(conversationHistory);

    // Create response message
    const responseMessage: Message = {
      role: 'assistant',
      content: response.content,
    };

    // Add response to memory
    await this.addToMemory(responseMessage, 'shortTerm');

    // Check for any actions in the response
    await this.processActions(responseMessage);

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

    // Process the task
    const taskMessage: Message = {
      role: 'system',
      content: `New task assigned: ${task.title}\n${task.description}`,
    };

    await this.processMessage(taskMessage);
    await this.completeTask(task.id);
  }

  async planNextAction(): Promise<void> {
    // Get all pending tasks
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

    // Assign tasks based on the plan
    for (const task of pendingTasks) {
      await this.assignTaskToAgent(task);
    }
  }

  private async assignTaskToAgent(task: Task): Promise<void> {
    // Get available agents
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

    // Prepare prompt to decide which agent should handle the task
    const assignmentPrompt: Message = {
      role: 'system',
      content: `Please assign this task to the most appropriate agent:
Task: ${task.title}
Description: ${task.description}
Available agents:
${agents.map((agent) => `- ${agent.name} (${agent.role})`).join('\n')}`,
    };

    const response = await this.processMessage(assignmentPrompt);

    // Parse the response to get the chosen agent
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
    }
  }

  private async processActions(message: Message): Promise<void> {
    // In a real implementation, we would parse the message for specific actions
    // and handle them accordingly (e.g., creating new tasks, updating priorities)
    if (message.content.toLowerCase().includes('create task')) {
      // Example of creating a new task based on message content
      await this.prisma.task.create({
        data: {
          projectId: this.projectId,
          title: 'New task from PM',
          description: message.content,
          status: 'pending' as TaskStatus,
          priority: 'medium' as TaskPriority,
          dependencies: '[]',
        },
      });
    }
  }

  private getProjectManagerPrompt(): string {
    return `${this.formatSystemPrompt()}

As a Project Manager agent, your responsibilities include:
1. Analyzing and breaking down project requirements
2. Creating and assigning tasks to appropriate agents
3. Monitoring project progress and adjusting plans
4. Coordinating between different agents
5. Ensuring project goals are met

Current project context:
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