import { PrismaClient } from '@prisma/client';
import { ChromaProvider } from '../providers/chroma';
import { OpenAIProvider } from '../providers/openai';
import { BaseAgent, AgentData } from './base';
import { ProjectManagerAgent } from './project-manager';
import { ArchitectAgent } from './architect';
import { FrontendDeveloperAgent } from './frontend-developer';
import { BackendDeveloperAgent } from './backend-developer';
import { CodeReviewerAgent } from './code-reviewer';
import { DevOpsAgent } from './devops';
import { QAEngineerAgent } from './qa-engineer';

export type AgentRole =
  | 'project_manager'
  | 'architect'
  | 'frontend_developer'
  | 'backend_developer'
  | 'code_reviewer'
  | 'devops'
  | 'qa_engineer';

export interface AgentConfig {
  name: string;
  role: AgentRole;
  projectId: string;
  provider: string;
  model: string;
}

export class AgentFactory {
  constructor(
    private prisma: PrismaClient,
    private chroma: ChromaProvider,
    private llm: OpenAIProvider
  ) {}

  async createAgent(config: AgentConfig): Promise<BaseAgent> {
    // Create agent record in database
    const agent = await this.prisma.agent.create({
      data: {
        name: config.name,
        role: config.role,
        projectId: config.projectId,
        provider: config.provider,
        model: config.model,
        systemPrompt: this.getSystemPrompt(config.role),
      },
      include: {
        project: true,
        learningProfile: true,
        state: true,
      },
    });

    // Create learning profile if it doesn't exist
    if (!agent.learningProfile) {
      await this.prisma.learningProfile.create({
        data: {
          agentId: agent.id,
        },
      });
    }

    // Create agent instance
    const agentData: AgentData = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      projectId: agent.projectId,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
    };

    return this.instantiateAgent(agentData);
  }

  private getSystemPrompt(role: AgentRole): string {
    switch (role) {
      case 'project_manager':
        return 'You are a project manager responsible for coordinating the development team...';
      case 'architect':
        return 'You are a software architect responsible for system design and technical decisions...';
      case 'frontend_developer':
        return 'You are a frontend developer skilled in creating user interfaces...';
      case 'backend_developer':
        return 'You are a backend developer skilled in server-side development...';
      case 'code_reviewer':
        return 'You are a code reviewer responsible for maintaining code quality...';
      case 'devops':
        return 'You are a DevOps engineer responsible for deployment and infrastructure...';
      case 'qa_engineer':
        return 'You are a QA engineer responsible for testing and quality assurance...';
      default:
        throw new Error(`Unknown agent role: ${role}`);
    }
  }

  private instantiateAgent(data: AgentData): BaseAgent {
    switch (data.role) {
      case 'project_manager':
        return new ProjectManagerAgent(data, this.prisma, this.chroma, this.llm);
      case 'architect':
        return new ArchitectAgent(data, this.prisma, this.chroma, this.llm);
      case 'frontend_developer':
        return new FrontendDeveloperAgent(data, this.prisma, this.chroma, this.llm);
      case 'backend_developer':
        return new BackendDeveloperAgent(data, this.prisma, this.chroma, this.llm);
      case 'code_reviewer':
        return new CodeReviewerAgent(data, this.prisma, this.chroma, this.llm);
      case 'devops':
        return new DevOpsAgent(data, this.prisma, this.chroma, this.llm);
      case 'qa_engineer':
        return new QAEngineerAgent(data, this.prisma, this.chroma, this.llm);
      default:
        throw new Error(`Unknown agent role: ${data.role}`);
    }
  }
}