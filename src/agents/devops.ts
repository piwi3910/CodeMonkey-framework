import { PrismaClient, Task as PrismaTask } from '@prisma/client';
import { Redis } from 'ioredis';
import { BaseAgent } from './base';
import { LLMProvider } from '../providers/base';
import { Message, Task, TaskStatus } from '../types';
import { ChromaProvider } from '../providers/chroma';
import * as fs from 'fs/promises';
import * as path from 'path';

export class DevOpsAgent extends BaseAgent {
  constructor(
    id: string,
    name: string,
    projectId: string,
    prisma: PrismaClient,
    redis: Redis,
    llm: LLMProvider,
    chroma: ChromaProvider
  ) {
    super(id, name, 'devops', projectId, prisma, redis, llm, chroma);
  }

  async processMessage(message: Message): Promise<Message> {
    await this.addToMemory(message, 'shortTerm');

    const relevantMemories = await this.getRelevantMemories(message.content);
    const projectContext = await this.getProjectContext();
    
    const conversationHistory: Message[] = [
      {
        role: 'system',
        content: this.getDevOpsPrompt(projectContext),
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
    await this.processInfrastructureChanges(responseMessage);

    return responseMessage;
  }

  async handleTask(task: Task): Promise<void> {
    await this.assignTask(task);

    await this.updateContext('currentTask', {
      id: task.id,
      title: task.title,
      description: task.description,
    });

    // Get infrastructure context
    const infraContext = await this.getInfrastructureContext(task);
    if (infraContext) {
      await this.updateContext('infrastructureContext', infraContext);
    }

    // Analyze task and create implementation plan
    const analysisPrompt: Message = {
      role: 'system',
      content: `Please analyze this DevOps task and create an implementation plan:
Task: ${task.title}
Description: ${task.description}

Current Infrastructure:
${infraContext || 'No infrastructure context available'}`,
    };

    const analysis = await this.processMessage(analysisPrompt);
    await this.updateContext('taskAnalysis', analysis.content);

    // Execute the implementation plan
    await this.executeImplementation(task, analysis.content);

    // Generate documentation if needed
    if (task.title.toLowerCase().includes('setup') || 
        task.title.toLowerCase().includes('config')) {
      await this.generateInfrastructureDocumentation(task);
    }

    await this.completeTask(task.id);
  }

  async planNextAction(): Promise<void> {
    const pendingTasks = await this.prisma.task.findMany({
      where: {
        projectId: this.projectId,
        status: 'pending',
        OR: [
          { title: { contains: 'deploy' } },
          { title: { contains: 'infrastructure' } },
          { title: { contains: 'ci' } },
          { title: { contains: 'cd' } },
          { description: { contains: 'deploy' } },
          { description: { contains: 'infrastructure' } },
          { description: { contains: 'ci' } },
          { description: { contains: 'cd' } },
        ],
      },
    });

    if (pendingTasks.length === 0) {
      return;
    }

    // Analyze and prioritize DevOps tasks
    const analysisPrompt: Message = {
      role: 'system',
      content: `Please analyze these pending DevOps tasks and prioritize them:
${pendingTasks.map((task) => `- ${task.title}\n  ${task.description}`).join('\n')}`,
    };

    const analysis = await this.processMessage(analysisPrompt);
    await this.updateContext('devopsPriorities', analysis.content);

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

Infrastructure Configuration:
${this.extractInfraConfig(projectContext.technical)}

Deployment Requirements:
${this.extractDeploymentRequirements(projectContext.technical)}
    `;
  }

  private extractInfraConfig(technical: string): string {
    try {
      const techData = JSON.parse(technical);
      return techData.infrastructure || 'No infrastructure configuration available.';
    } catch {
      return 'No infrastructure configuration available.';
    }
  }

  private extractDeploymentRequirements(technical: string): string {
    try {
      const techData = JSON.parse(technical);
      return techData.deployment || 'No deployment requirements defined.';
    } catch {
      return 'No deployment requirements defined.';
    }
  }

  private async getInfrastructureContext(task: Task): Promise<string | null> {
    // Use ChromaDB to find relevant infrastructure code and configs
    const relevantDocs = await this.chroma.findRelevantDocumentation(
      `${task.title}\n${task.description}`,
      {
        projectId: this.projectId,
        type: 'technical',
        nResults: 5,
      }
    );

    if (relevantDocs.length === 0) {
      return null;
    }

    return relevantDocs
      .map((doc) => `${doc.metadata.title}\n\n${doc.content}`)
      .join('\n\n');
  }

  private async processInfrastructureChanges(message: Message): Promise<void> {
    // Extract infrastructure changes and store them
    const changes = this.extractInfrastructureChanges(message.content);
    
    if (changes.length > 0) {
      await this.storeInfrastructureChanges(changes);
    }
  }

  private extractInfrastructureChanges(content: string): Array<{
    type: 'config' | 'script' | 'pipeline';
    content: string;
    file?: string;
  }> {
    const changes: Array<{
      type: 'config' | 'script' | 'pipeline';
      content: string;
      file?: string;
    }> = [];

    // Extract code blocks and identify their types
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    
    for (const block of codeBlocks) {
      const match = block.match(/```(\w+)\s*([^\n]*)\n([\s\S]*?)```/);
      if (match) {
        const [, language, filePath, code] = match;
        const type = this.determineChangeType(language, filePath);
        if (type) {
          changes.push({
            type,
            content: code.trim(),
            file: filePath,
          });
        }
      }
    }

    return changes;
  }

  private determineChangeType(
    language: string,
    filePath: string
  ): 'config' | 'script' | 'pipeline' | null {
    if (
      language === 'yaml' ||
      language === 'yml' ||
      filePath.endsWith('.yaml') ||
      filePath.endsWith('.yml')
    ) {
      return filePath.includes('pipeline') ? 'pipeline' : 'config';
    }

    if (
      language === 'bash' ||
      language === 'sh' ||
      filePath.endsWith('.sh')
    ) {
      return 'script';
    }

    if (filePath.includes('Dockerfile') || filePath.includes('docker-compose')) {
      return 'config';
    }

    if (
      filePath.includes('.github/workflows') ||
      filePath.includes('gitlab-ci') ||
      filePath.includes('jenkins')
    ) {
      return 'pipeline';
    }

    return null;
  }

  private async storeInfrastructureChanges(changes: Array<{
    type: 'config' | 'script' | 'pipeline';
    content: string;
    file?: string;
  }>): Promise<void> {
    const projectContext = await this.prisma.projectContext.findUnique({
      where: { projectId: this.projectId },
    });

    if (projectContext) {
      const technical = JSON.parse(projectContext.technical);
      technical.infrastructureChanges = technical.infrastructureChanges || {};
      technical.infrastructureChanges[this.state.currentTask!] = {
        changes,
        timestamp: new Date().toISOString(),
      };

      await this.prisma.projectContext.update({
        where: { projectId: this.projectId },
        data: {
          technical: JSON.stringify(technical),
        },
      });

      // Store in ChromaDB for future reference
      for (const change of changes) {
        await this.chroma.addDocumentation(
          change.content,
          {
            projectId: this.projectId,
            type: 'technical',
            title: `Infrastructure Change: ${change.file || change.type}`,
            timestamp: new Date().toISOString(),
          }
        );
      }
    }
  }

  private async executeImplementation(task: Task, plan: string): Promise<void> {
    const implementationPrompt: Message = {
      role: 'system',
      content: `Please implement the infrastructure changes according to this plan:
${plan}

Current task:
${task.title}
${task.description}

Please provide the implementation in code blocks with file paths.`,
    };

    const implementation = await this.processMessage(implementationPrompt);
    await this.processInfrastructureChanges(implementation);
  }

  private async generateInfrastructureDocumentation(task: Task): Promise<void> {
    const docPrompt: Message = {
      role: 'system',
      content: `Please generate infrastructure documentation for:
Task: ${task.title}
${task.description}

Include:
1. Setup instructions
2. Configuration details
3. Dependencies
4. Environment variables
5. Deployment steps
6. Monitoring setup
7. Troubleshooting guide`,
    };

    const documentation = await this.processMessage(docPrompt);
    
    // Store documentation in ChromaDB
    await this.chroma.addDocumentation(
      documentation.content,
      {
        projectId: this.projectId,
        type: 'technical',
        title: `Infrastructure Documentation: ${task.title}`,
        timestamp: new Date().toISOString(),
      }
    );
  }

  private async createImplementationTasks(task: PrismaTask): Promise<void> {
    const implementationPrompt: Message = {
      role: 'system',
      content: `Please break down this DevOps task into specific implementation tasks:
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

  private getDevOpsPrompt(projectContext: string): string {
    return `${this.formatSystemPrompt()}

As a DevOps agent, your responsibilities include:
1. Managing infrastructure and deployments
2. Configuring CI/CD pipelines
3. Setting up monitoring and logging
4. Implementing security best practices
5. Automating operational tasks
6. Managing container orchestration
7. Handling scaling and reliability

Current project context:
${projectContext}

Current agent context:
${JSON.stringify(this.state.context, null, 2)}

Please provide infrastructure changes in code blocks with appropriate file paths and languages:

For configs:
\`\`\`yaml
filename: config.yml
content here
\`\`\`

For scripts:
\`\`\`bash
filename: script.sh
content here
\`\`\`

For pipelines:
\`\`\`yaml
filename: .github/workflows/pipeline.yml
content here
\`\`\``;
  }
}