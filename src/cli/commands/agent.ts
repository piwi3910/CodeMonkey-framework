import {
  CommandType,
  SubCommandType,
  CommandContext,
  CommandResult,
} from '../types';
import { BaseCommandHandler, CommandBuilder } from '../registry';
import { AgentFactory, AgentConfig, AgentRole } from '../../agents/factory';
import { LearningManager } from '../../learning/manager';
import { PrismaClient } from '@prisma/client';
import { ChromaProvider } from '../../providers/chroma';
import { OpenAIProvider } from '../../providers/openai';
import { config } from '../../config/env';

export class AgentCommandHandler extends BaseCommandHandler {
  constructor(
    private prisma: PrismaClient,
    private factory: AgentFactory,
    private learning: LearningManager
  ) {
    super();
  }

  async execute(
    subCommand: SubCommandType['agent'],
    options: Record<string, any>,
    context: CommandContext
  ): Promise<CommandResult> {
    try {
      switch (subCommand) {
        case 'create':
          return await this.createAgent(options);
        case 'list':
          return await this.listAgents(options);
        case 'info':
          return await this.getAgentInfo(options);
        case 'delete':
          return await this.deleteAgent(options);
        case 'update':
          return await this.updateAgent(options);
        case 'skills':
          return await this.getAgentSkills(options);
        case 'metrics':
          return await this.getAgentMetrics(options);
        default:
          return this.formatError(`Unknown subcommand: ${subCommand}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        return this.formatError(error.message);
      }
      return this.formatError('An unknown error occurred');
    }
  }

  private async createAgent(options: Record<string, any>): Promise<CommandResult> {
    const config: AgentConfig = {
      name: options.name,
      role: options.role as AgentRole,
      projectId: options.project,
      provider: options.provider,
      model: options.model,
    };

    const agent = await this.factory.createAgent(config);

    return this.formatResult({
      message: 'Agent created successfully',
      agent: {
        id: agent.getId(),
        name: agent.getName(),
        role: agent.getRole(),
        projectId: agent.getProjectId(),
      },
    });
  }

  private async listAgents(options: Record<string, any>): Promise<CommandResult> {
    const { projectId } = options;

    const agents = await this.prisma.agent.findMany({
      where: projectId ? { projectId } : undefined,
      include: {
        project: true,
        learningProfile: {
          select: {
            totalTasks: true,
            successfulTasks: true,
            learningRate: true,
          },
        },
      },
    });

    return this.formatResult({
      agents: agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        projectName: agent.project.name,
        metrics: agent.learningProfile && {
          totalTasks: agent.learningProfile.totalTasks,
          successRate: agent.learningProfile.successfulTasks / agent.learningProfile.totalTasks,
          learningRate: agent.learningProfile.learningRate,
        },
      })),
    });
  }

  private async getAgentInfo(options: Record<string, any>): Promise<CommandResult> {
    const { id } = options;

    const agent = await this.prisma.agent.findUnique({
      where: { id },
      include: {
        project: true,
        learningProfile: {
          include: {
            skills: true,
            specializations: true,
            metrics: {
              take: 10,
              orderBy: { timestamp: 'desc' },
            },
          },
        },
        state: true,
      },
    });

    if (!agent) {
      return this.formatError(`Agent not found: ${id}`);
    }

    return this.formatResult({
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        projectName: agent.project.name,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        learning: agent.learningProfile && {
          totalTasks: agent.learningProfile.totalTasks,
          successfulTasks: agent.learningProfile.successfulTasks,
          failedTasks: agent.learningProfile.failedTasks,
          learningRate: agent.learningProfile.learningRate,
          skills: agent.learningProfile.skills.map(s => JSON.parse(s.data)),
          specializations: agent.learningProfile.specializations.map(s => JSON.parse(s.data)),
          recentMetrics: agent.learningProfile.metrics.map(m => JSON.parse(m.data)),
        },
        state: agent.state && {
          context: JSON.parse(agent.state.context),
          shortTerm: JSON.parse(agent.state.shortTerm),
          longTerm: JSON.parse(agent.state.longTerm),
        },
      },
    });
  }

  private async deleteAgent(options: Record<string, any>): Promise<CommandResult> {
    const { id } = options;

    await this.prisma.agent.delete({
      where: { id },
    });

    return this.formatResult({
      message: 'Agent deleted successfully',
      id,
    });
  }

  private async updateAgent(options: Record<string, any>): Promise<CommandResult> {
    const { id, name, provider, model, systemPrompt } = options;

    const agent = await this.prisma.agent.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(provider && { provider }),
        ...(model && { model }),
        ...(systemPrompt && { systemPrompt }),
      },
    });

    return this.formatResult({
      message: 'Agent updated successfully',
      agent,
    });
  }

  private async getAgentSkills(options: Record<string, any>): Promise<CommandResult> {
    const { id } = options;

    const profile = await this.learning.getProfile(id);
    if (!profile) {
      return this.formatError(`Learning profile not found for agent: ${id}`);
    }

    return this.formatResult({
      skills: Array.from(profile.skills.values()),
      specializations: Array.from(profile.specializations.values()),
    });
  }

  private async getAgentMetrics(options: Record<string, any>): Promise<CommandResult> {
    const { id, days = 7 } = options;

    const profile = await this.learning.getProfile(id);
    if (!profile) {
      return this.formatError(`Learning profile not found for agent: ${id}`);
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const recentMetrics = profile.recentMetrics.filter(m => 
      m.timestamp >= cutoff
    );

    const averages = {
      taskSuccess: 0,
      responseQuality: 0,
      resourceUsage: 0,
      collaborationScore: 0,
    };

    if (recentMetrics.length > 0) {
      recentMetrics.forEach(m => {
        averages.taskSuccess += m.taskSuccess;
        averages.responseQuality += m.responseQuality;
        averages.resourceUsage += m.resourceUsage;
        averages.collaborationScore += m.collaborationScore || 0;
      });

      const count = recentMetrics.length;
      averages.taskSuccess /= count;
      averages.responseQuality /= count;
      averages.resourceUsage /= count;
      averages.collaborationScore /= count;
    }

    return this.formatResult({
      timeRange: {
        start: cutoff,
        end: new Date(),
      },
      metrics: {
        total: recentMetrics.length,
        averages,
        trend: this.calculateTrend(recentMetrics),
      },
    });
  }

  private calculateTrend(metrics: any[]): 'improving' | 'stable' | 'declining' {
    if (metrics.length < 2) return 'stable';

    const mid = Math.floor(metrics.length / 2);
    const firstHalf = metrics.slice(0, mid);
    const secondHalf = metrics.slice(mid);

    const firstAvg = firstHalf.reduce((sum, m) => sum + m.taskSuccess, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, m) => sum + m.taskSuccess, 0) / secondHalf.length;

    const difference = secondAvg - firstAvg;
    if (difference > 0.1) return 'improving';
    if (difference < -0.1) return 'declining';
    return 'stable';
  }
}