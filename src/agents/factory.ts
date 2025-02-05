import { ChromaProvider } from '../providers/chroma';
import { OpenAIProvider } from '../providers/openai';
import { BaseAgent } from './base';
import { FrontendDeveloperAgent } from './frontend-developer';
import { BackendDeveloperAgent } from './backend-developer';
import { CodeReviewerAgent } from './code-reviewer';
import { DevOpsAgent } from './devops';
import { QAEngineerAgent } from './qa-engineer';
import { ProjectManagerAgent } from './project-manager';
import { ArchitectAgent } from './architect';
import { Agent, AgentState } from '../models';
import { sequelize } from '../database/init';

export enum AgentRole {
  FrontendDeveloper = 'frontend-developer',
  BackendDeveloper = 'backend-developer',
  CodeReviewer = 'code-reviewer',
  DevOps = 'devops',
  QAEngineer = 'qa-engineer',
  ProjectManager = 'project-manager',
  Architect = 'architect',
}

export interface AgentConfig {
  name?: string;
  role: AgentRole;
  projectId: string;
  provider: string;
  modelName: string;
}

export class AgentFactory {
  constructor(
    private chroma: ChromaProvider,
    private llm: OpenAIProvider
  ) {}

  public async createAgent(config: AgentConfig): Promise<BaseAgent> {
    // Get role-specific system prompt
    const systemPrompt = await this.getRolePrompt(config.role);

    // Create agent record in transaction
    const result = await sequelize.transaction(async (t) => {
      // Create agent
      const agent = await Agent.create({
        name: config.name || `${config.role} Agent`,
        role: config.role,
        provider: config.provider,
        model: config.modelName,
        systemPrompt,
        projectId: config.projectId,
      }, { transaction: t });

      // Create initial state
      await AgentState.create({
        agentId: agent.id,
        context: '{}',
        shortTerm: '[]',
        longTerm: '[]',
      }, { transaction: t });

      return agent;
    });

    // Create agent instance based on role
    return this.instantiateAgent({
      id: result.id,
      name: result.name,
      role: result.role as AgentRole,
      projectId: result.projectId,
      provider: result.provider,
      model: result.model,
      systemPrompt: result.systemPrompt,
    });
  }

  public async getAgent(agentId: string): Promise<BaseAgent> {
    const agent = await Agent.findByPk(agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return this.instantiateAgent({
      id: agent.id,
      name: agent.name,
      role: agent.role as AgentRole,
      projectId: agent.projectId,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
    });
  }

  private instantiateAgent(data: {
    id: string;
    name: string;
    role: AgentRole;
    projectId: string;
    provider: string;
    model: string;
    systemPrompt: string;
  }): BaseAgent {
    switch (data.role) {
      case AgentRole.FrontendDeveloper:
        return new FrontendDeveloperAgent(data, sequelize, this.chroma, this.llm);
      case AgentRole.BackendDeveloper:
        return new BackendDeveloperAgent(data, sequelize, this.chroma, this.llm);
      case AgentRole.CodeReviewer:
        return new CodeReviewerAgent(data, sequelize, this.chroma, this.llm);
      case AgentRole.DevOps:
        return new DevOpsAgent(data, sequelize, this.chroma, this.llm);
      case AgentRole.QAEngineer:
        return new QAEngineerAgent(data, sequelize, this.chroma, this.llm);
      case AgentRole.ProjectManager:
        return new ProjectManagerAgent(data, sequelize, this.chroma, this.llm);
      case AgentRole.Architect:
        return new ArchitectAgent(data, sequelize, this.chroma, this.llm);
      default:
        throw new Error(`Unknown agent role: ${data.role}`);
    }
  }

  private async getRolePrompt(role: AgentRole): Promise<string> {
    const promptPath = `prompts/${role}.md`;
    try {
      const fs = await import('fs/promises');
      const prompt = await fs.readFile(promptPath, 'utf-8');
      return prompt;
    } catch (error) {
      throw new Error(`Failed to load prompt for role ${role}: ${error}`);
    }
  }
}