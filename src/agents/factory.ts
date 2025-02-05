import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { BaseAgent } from './base';
import { ProjectManagerAgent } from './project-manager';
import { ArchitectAgent } from './architect';
import { FrontendDeveloperAgent } from './frontend-developer';
import { BackendDeveloperAgent } from './backend-developer';
import { CodeReviewerAgent } from './code-reviewer';
import { DevOpsAgent } from './devops';
import { QAEngineerAgent } from './qa-engineer';
import { AgentRole, FrameworkError } from '../types';
import { LLMProvider } from '../providers/base';
import { ClaudeProvider } from '../providers/claude';
import { OpenAIProvider } from '../providers/openai';
import { OpenRouterProvider } from '../providers/openrouter';
import { ChromaProvider } from '../providers/chroma';
import { config } from '../config/env';

export class AgentFactory {
  private chroma: ChromaProvider;

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {
    this.chroma = new ChromaProvider();
  }

  async initialize(): Promise<void> {
    await this.chroma.initialize();
  }

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

    const commonArgs = [
      id,
      name,
      projectId,
      this.prisma,
      this.redis,
      llmProvider,
      this.chroma,
    ] as const;

    switch (role) {
      case 'project_manager':
        return new ProjectManagerAgent(...commonArgs);

      case 'architect':
        return new ArchitectAgent(...commonArgs);

      case 'frontend_developer':
        return new FrontendDeveloperAgent(...commonArgs);

      case 'backend_developer':
        return new BackendDeveloperAgent(...commonArgs);

      case 'code_reviewer':
        return new CodeReviewerAgent(...commonArgs);

      case 'devops':
        return new DevOpsAgent(...commonArgs);

      case 'qa_engineer':
        return new QAEngineerAgent(...commonArgs);

      default:
        throw new FrameworkError(
          `Unknown agent role: ${role}`,
          'INVALID_AGENT_ROLE',
          400
        );
    }
  }

  private async createLLMProvider(): Promise<LLMProvider> {
    const provider = config.llm.defaultProvider;
    const model = config.llm.defaultModel;

    switch (provider) {
      case 'claude':
        if (!config.llm.claude.apiKey) {
          throw new FrameworkError(
            'Claude API key not configured',
            'MISSING_API_KEY',
            500
          );
        }
        return new ClaudeProvider({
          apiKey: config.llm.claude.apiKey,
          modelName: model as any,
        });

      case 'openai':
        if (!config.llm.openai.apiKey) {
          throw new FrameworkError(
            'OpenAI API key not configured',
            'MISSING_API_KEY',
            500
          );
        }
        return new OpenAIProvider({
          apiKey: config.llm.openai.apiKey,
          modelName: model,
        });

      case 'openrouter':
        if (!config.llm.openrouter.apiKey) {
          throw new FrameworkError(
            'OpenRouter API key not configured',
            'MISSING_API_KEY',
            500
          );
        }
        return new OpenRouterProvider({
          apiKey: config.llm.openrouter.apiKey,
          modelName: model,
        });

      default:
        throw new FrameworkError(
          `Unknown provider: ${provider}`,
          'INVALID_PROVIDER',
          400
        );
    }
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