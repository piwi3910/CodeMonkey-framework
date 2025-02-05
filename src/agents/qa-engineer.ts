import { PrismaClient, Task as PrismaTask } from '@prisma/client';
import { Redis } from 'ioredis';
import { BaseAgent } from './base';
import { LLMProvider } from '../providers/base';
import { Message, Task, TaskStatus } from '../types';
import { ChromaProvider } from '../providers/chroma';
import * as fs from 'fs/promises';
import * as path from 'path';

export class QAEngineerAgent extends BaseAgent {
  constructor(
    id: string,
    name: string,
    projectId: string,
    prisma: PrismaClient,
    redis: Redis,
    llm: LLMProvider,
    chroma: ChromaProvider
  ) {
    super(id, name, 'qa_engineer', projectId, prisma, redis, llm, chroma);
  }

  async processMessage(message: Message): Promise<Message> {
    await this.addToMemory(message, 'shortTerm');

    const relevantMemories = await this.getRelevantMemories(message.content);
    const projectContext = await this.getProjectContext();
    
    const conversationHistory: Message[] = [
      {
        role: 'system',
        content: this.getQAEngineerPrompt(projectContext),
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
    await this.processTestChanges(responseMessage);

    return responseMessage;
  }

  async handleTask(task: Task): Promise<void> {
    await this.assignTask(task);

    await this.updateContext('currentTask', {
      id: task.id,
      title: task.title,
      description: task.description,
    });

    // Get test context
    const testContext = await this.getTestContext(task);
    if (testContext) {
      await this.updateContext('testContext', testContext);
    }

    // Create test plan
    const planPrompt: Message = {
      role: 'system',
      content: `Please create a test plan for:
Task: ${task.title}
Description: ${task.description}

Current test context:
${testContext || 'No test context available'}

Include:
1. Test objectives
2. Test scope
3. Test scenarios
4. Test cases
5. Test data requirements
6. Test environment setup
7. Expected results`,
    };

    const plan = await this.processMessage(planPrompt);
    await this.updateContext('testPlan', plan.content);

    // Implement test cases
    await this.implementTestCases(task, plan.content);

    // Generate test report if this is a test execution task
    if (task.title.toLowerCase().includes('test') || 
        task.title.toLowerCase().includes('verify')) {
      await this.generateTestReport(task);
    }

    await this.completeTask(task.id);
  }

  async planNextAction(): Promise<void> {
    const pendingTasks = await this.prisma.task.findMany({
      where: {
        projectId: this.projectId,
        status: 'pending',
        OR: [
          { title: { contains: 'test' } },
          { title: { contains: 'qa' } },
          { title: { contains: 'verify' } },
          { description: { contains: 'test' } },
          { description: { contains: 'qa' } },
          { description: { contains: 'verify' } },
        ],
      },
    });

    if (pendingTasks.length === 0) {
      return;
    }

    // Analyze and prioritize QA tasks
    const analysisPrompt: Message = {
      role: 'system',
      content: `Please analyze these pending QA tasks and prioritize them:
${pendingTasks.map((task) => `- ${task.title}\n  ${task.description}`).join('\n')}`,
    };

    const analysis = await this.processMessage(analysisPrompt);
    await this.updateContext('qaPriorities', analysis.content);

    // Create test tasks
    for (const task of pendingTasks) {
      await this.createTestTasks(task);
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

Test Requirements:
${this.extractTestRequirements(projectContext.technical)}

Test Coverage:
${this.extractTestCoverage(projectContext.technical)}
    `;
  }

  private extractTestRequirements(technical: string): string {
    try {
      const techData = JSON.parse(technical);
      return techData.testRequirements || 'No test requirements defined.';
    } catch {
      return 'No test requirements defined.';
    }
  }

  private extractTestCoverage(technical: string): string {
    try {
      const techData = JSON.parse(technical);
      return techData.testCoverage || 'No test coverage data available.';
    } catch {
      return 'No test coverage data available.';
    }
  }

  private async getTestContext(task: Task): Promise<string | null> {
    // Use ChromaDB to find relevant test code and documentation
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

  private async processTestChanges(message: Message): Promise<void> {
    // Extract test changes and store them
    const changes = this.extractTestChanges(message.content);
    
    if (changes.length > 0) {
      await this.storeTestChanges(changes);
    }
  }

  private extractTestChanges(content: string): Array<{
    type: 'unit' | 'integration' | 'e2e';
    content: string;
    file?: string;
  }> {
    const changes: Array<{
      type: 'unit' | 'integration' | 'e2e';
      content: string;
      file?: string;
    }> = [];

    // Extract code blocks and identify their types
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    
    for (const block of codeBlocks) {
      const match = block.match(/```(\w+)\s*([^\n]*)\n([\s\S]*?)```/);
      if (match) {
        const [, language, filePath, code] = match;
        const type = this.determineTestType(language, filePath);
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

  private determineTestType(
    language: string,
    filePath: string
  ): 'unit' | 'integration' | 'e2e' | null {
    if (filePath.includes('.spec.') || filePath.includes('.test.')) {
      if (filePath.includes('e2e')) {
        return 'e2e';
      }
      if (filePath.includes('integration')) {
        return 'integration';
      }
      return 'unit';
    }

    if (filePath.includes('__tests__')) {
      return 'unit';
    }

    if (filePath.includes('cypress') || filePath.includes('playwright')) {
      return 'e2e';
    }

    return null;
  }

  private async storeTestChanges(changes: Array<{
    type: 'unit' | 'integration' | 'e2e';
    content: string;
    file?: string;
  }>): Promise<void> {
    const projectContext = await this.prisma.projectContext.findUnique({
      where: { projectId: this.projectId },
    });

    if (projectContext) {
      const technical = JSON.parse(projectContext.technical);
      technical.testChanges = technical.testChanges || {};
      technical.testChanges[this.state.currentTask!] = {
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
            title: `Test Change: ${change.file || change.type}`,
            timestamp: new Date().toISOString(),
          }
        );
      }
    }
  }

  private async implementTestCases(task: Task, plan: string): Promise<void> {
    const implementationPrompt: Message = {
      role: 'system',
      content: `Please implement test cases according to this test plan:
${plan}

Current task:
${task.title}
${task.description}

Please provide the implementation in code blocks with file paths.`,
    };

    const implementation = await this.processMessage(implementationPrompt);
    await this.processTestChanges(implementation);
  }

  private async generateTestReport(task: Task): Promise<void> {
    const reportPrompt: Message = {
      role: 'system',
      content: `Please generate a test report for:
Task: ${task.title}
${task.description}

Include:
1. Test summary
2. Test environment
3. Test scenarios executed
4. Test results
5. Issues found
6. Test coverage
7. Recommendations`,
    };

    const report = await this.processMessage(reportPrompt);
    
    // Store report in ChromaDB
    await this.chroma.addDocumentation(
      report.content,
      {
        projectId: this.projectId,
        type: 'technical',
        title: `Test Report: ${task.title}`,
        timestamp: new Date().toISOString(),
      }
    );
  }

  private async createTestTasks(task: PrismaTask): Promise<void> {
    const testTaskPrompt: Message = {
      role: 'system',
      content: `Please break down this QA task into specific test tasks:
Task: ${task.title}
${task.description}`,
    };

    const response = await this.processMessage(testTaskPrompt);

    // Create test tasks
    await this.prisma.task.create({
      data: {
        projectId: this.projectId,
        title: `Test: ${task.title}`,
        description: response.content,
        status: 'pending' as TaskStatus,
        priority: task.priority,
        dependencies: JSON.stringify([task.id]),
      },
    });
  }

  private getQAEngineerPrompt(projectContext: string): string {
    return `${this.formatSystemPrompt()}

As a QA Engineer agent, your responsibilities include:
1. Creating comprehensive test plans
2. Writing and executing tests
3. Verifying bug fixes
4. Tracking test coverage
5. Performing regression testing
6. Documenting test results
7. Identifying quality issues

Current project context:
${projectContext}

Current agent context:
${JSON.stringify(this.state.context, null, 2)}

Please provide test implementations in code blocks with appropriate file paths and frameworks:

For unit tests:
\`\`\`typescript
filename: src/__tests__/unit/component.test.ts
content here
\`\`\`

For integration tests:
\`\`\`typescript
filename: src/__tests__/integration/api.test.ts
content here
\`\`\`

For E2E tests:
\`\`\`typescript
filename: e2e/flows/user-journey.spec.ts
content here
\`\`\``;
  }
}