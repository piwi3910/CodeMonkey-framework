import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { BaseAgent } from './base';
import { ProjectManagerAgent } from './project-manager';
import { ArchitectAgent } from './architect';
import { AgentRole, FrameworkError } from '../types';
import { LLMProvider } from '../providers/base';
import { ClaudeProvider } from '../providers/claude';
import { config } from '../config/env';

export class AgentFactory {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  async createAgent(
    role: AgentRole,
    name: string,
    projectId: string,
    providerId?: string
  ): Promise<BaseAgent> {
    // Create the agent record in the database
    const agent = await this.prisma.agent.create({
      data: {
        name,
        role,
        provider: providerId || config.llm.defaultProvider,
        systemPrompt: this.getDefaultSystemPrompt(role),
        project: {
          connect: {
            id: projectId,
          },
        },
      },
    });

    // Initialize the agent's state
    await this.prisma.agentState.create({
      data: {
        agentId: agent.id,
        context: '{}',
        shortTerm: '[]',
        longTerm: '[]',
      },
    });

    // Create the appropriate agent instance
    return this.instantiateAgent(agent.id, name, role, projectId);
  }

  async getAgent(agentId: string): Promise<BaseAgent> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new FrameworkError('Agent not found', 'AGENT_NOT_FOUND', 404);
    }

    return this.instantiateAgent(agent.id, agent.name, agent.role as AgentRole, agent.projectId);
  }

  private async instantiateAgent(
    id: string,
    name: string,
    role: AgentRole,
    projectId: string
  ): Promise<BaseAgent> {
    const llmProvider = await this.createLLMProvider();

    switch (role) {
      case 'project_manager':
        return new ProjectManagerAgent(
          id,
          name,
          projectId,
          this.prisma,
          this.redis,
          llmProvider
        );

      case 'architect':
        return new ArchitectAgent(
          id,
          name,
          projectId,
          this.prisma,
          this.redis,
          llmProvider
        );

      // Add other agent types here as they are implemented
      case 'frontend_developer':
      case 'backend_developer':
      case 'code_reviewer':
      case 'devops':
      case 'qa_engineer':
        throw new FrameworkError(
          `Agent role ${role} not yet implemented`,
          'AGENT_NOT_IMPLEMENTED',
          501
        );

      default:
        throw new FrameworkError(
          `Unknown agent role: ${role}`,
          'INVALID_AGENT_ROLE',
          400
        );
    }
  }

  private async createLLMProvider(): Promise<LLMProvider> {
    // For now, we're just using Claude as the default provider
    // In the future, this could be expanded to support multiple providers
    if (!config.llm.claude.apiKey) {
      throw new FrameworkError(
        'Claude API key not configured',
        'MISSING_API_KEY',
        500
      );
    }

    return new ClaudeProvider({
      apiKey: config.llm.claude.apiKey,
      modelName: config.llm.defaultModel as any, // Type assertion since we know it's a valid Claude model
    });
  }

  private getDefaultSystemPrompt(role: AgentRole): string {
    switch (role) {
      case 'project_manager':
        return `You are a Project Manager agent responsible for:
- Coordinating team activities
- Managing tasks and priorities
- Ensuring project goals are met
- Facilitating communication between agents`;

      case 'architect':
        return `You are an Architect agent responsible for:
- Making high-level technical decisions
- Designing system architecture
- Ensuring technical consistency
- Evaluating technical trade-offs
- Providing architectural guidance`;

      case 'frontend_developer':
        return `You are a Frontend Developer agent responsible for:
- Implementing user interfaces
- Ensuring responsive design
- Maintaining frontend code quality
- Optimizing frontend performance`;

      case 'backend_developer':
        return `You are a Backend Developer agent responsible for:
- Implementing server-side logic
- Designing and maintaining APIs
- Managing data models
- Ensuring system performance`;

      case 'code_reviewer':
        return `You are a Code Reviewer agent responsible for:
- Reviewing code changes
- Ensuring code quality
- Identifying potential issues
- Suggesting improvements`;

      case 'devops':
        return `You are a DevOps agent responsible for:
- Managing infrastructure
- Setting up CI/CD pipelines
- Monitoring system health
- Ensuring system reliability`;

      case 'qa_engineer':
        return `You are a QA Engineer agent responsible for:
- Testing system functionality
- Writing and maintaining tests
- Identifying bugs and issues
- Ensuring quality standards`;

      default:
        return `You are an agent with role ${role}. Please await specific instructions.`;
    }
  }
}