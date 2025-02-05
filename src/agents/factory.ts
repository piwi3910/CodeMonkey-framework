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
import { OllamaProvider } from '../providers/ollama';
import { ChromaProvider } from '../providers/chroma';
import { config } from '../config/env';
import * as fs from 'fs/promises';
import * as path from 'path';

export class AgentFactory {
  private chroma: ChromaProvider;
  private promptCache: Map<string, string> = new Map();

  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {
    this.chroma = new ChromaProvider();
  }

  async initialize(): Promise<void> {
    await this.chroma.initialize();
    await this.loadPrompts();
  }

  private async loadPrompts(): Promise<void> {
    const promptsDir = path.join(process.cwd(), 'prompts');
    const roles = [
      'project-manager',
      'architect',
      'frontend-developer',
      'backend-developer',
      'code-reviewer',
      'devops',
      'qa-engineer',
    ];

    for (const role of roles) {
      const promptPath = path.join(promptsDir, `${role}.md`);
      try {
        const content = await fs.readFile(promptPath, 'utf-8');
        this.promptCache.set(role, content);
      } catch (error) {
        console.error(`Failed to load prompt for ${role}:`, error);
        throw new FrameworkError(
          `Failed to load prompt for ${role}`,
          'PROMPT_LOAD_ERROR',
          500
        );
      }
    }
  }

  async createAgent(
    role: AgentRole,
    name: string,
    projectId: string,
    providerId?: string
  ): Promise<BaseAgent> {
    const systemPrompt = await this.getSystemPrompt(role);

    // Create the agent record in the database
    const agent = await this.prisma.agent.create({
      data: {
        name,
        role,
        provider: providerId || config.llm.defaultProvider,
        systemPrompt,
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

  private async getSystemPrompt(role: AgentRole): Promise<string> {
    const roleSlug = role.replace('_', '-');
    const prompt = this.promptCache.get(roleSlug);

    if (!prompt) {
      throw new FrameworkError(
        `No prompt found for role: ${role}`,
        'PROMPT_NOT_FOUND',
        500
      );
    }

    return prompt;
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

      case 'ollama':
        return new OllamaProvider({
          modelName: model,
          baseUrl: config.llm.ollama?.baseUrl,
        });

      default:
        throw new FrameworkError(
          `Unknown provider: ${provider}`,
          'INVALID_PROVIDER',
          400
        );
    }
  }
}