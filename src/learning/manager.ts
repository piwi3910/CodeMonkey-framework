import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  LearningMetrics,
  LearningProfile,
  LearningEvent,
  Skill,
  Specialization,
  LearningConfig,
  LearningStrategy,
  SkillRequirement,
  LearningEventType,
} from './types';
import { ChromaProvider } from '../providers/chroma';
import { config } from '../config/env';

export class LearningManager {
  private learningProfiles: Map<string, LearningProfile> = new Map();
  private readonly defaultConfig: LearningConfig = {
    baseExperienceRate: 100,
    levelUpThreshold: 1000,
    maxLevel: 100,
    metricsHistorySize: 100,
    learningRateDecay: 0.95,
    specializationThreshold: 70,
    feedbackWeight: 0.3,
    collaborationBonus: 50,
    skillDecayRate: 0.01,
    minimumSkillLevel: 10,
  };

  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private chroma: ChromaProvider,
    private strategy: LearningStrategy
  ) {}

  async initialize(): Promise<void> {
    // Load learning profiles from database
    const profiles = await this.prisma.learningProfile.findMany({
      include: {
        skills: true,
        specializations: true,
        metrics: {
          orderBy: { timestamp: 'desc' },
          take: this.defaultConfig.metricsHistorySize,
        },
      },
    });

    // Initialize in-memory cache
    for (const profile of profiles) {
      this.learningProfiles.set(profile.agentId, this.mapDatabaseProfile(profile));
    }
  }

  async recordEvent(event: LearningEvent): Promise<void> {
    const profile = await this.getProfile(event.agentId);
    
    // Update metrics
    profile.totalTasks++;
    if (event.metrics.taskSuccess >= 0.8) {
      profile.successfulTasks++;
    } else {
      profile.failedTasks++;
    }

    // Update recent metrics
    profile.recentMetrics.push(event.metrics);
    if (profile.recentMetrics.length > this.defaultConfig.metricsHistorySize) {
      profile.recentMetrics.shift();
    }

    // Update average metrics
    profile.averageMetrics = this.calculateAverageMetrics(profile.recentMetrics);

    // Process skills and specializations
    await this.processLearningEvent(profile, event);

    // Update learning rate
    profile.learningRate = this.strategy.calculateLearningRate(profile, this.defaultConfig);
    profile.lastUpdated = new Date();

    // Save updates
    await this.saveProfile(profile);

    // Store event in ChromaDB for long-term analysis
    await this.chroma.addDocumentation(
      JSON.stringify(event),
      {
        projectId: 'learning_system',
        type: 'learning_event',
        title: `${event.type} - ${event.agentId}`,
        timestamp: event.timestamp.toISOString(),
      }
    );
  }

  async getProfile(agentId: string): Promise<LearningProfile> {
    if (!this.learningProfiles.has(agentId)) {
      // Create new profile if it doesn't exist
      const profile = this.createNewProfile(agentId);
      await this.saveProfile(profile);
      this.learningProfiles.set(agentId, profile);
    }
    return this.learningProfiles.get(agentId)!;
  }

  async checkSkillRequirements(agentId: string, requirements: SkillRequirement[]): Promise<boolean> {
    const profile = await this.getProfile(agentId);
    
    for (const req of requirements) {
      const skill = profile.skills.get(req.skillId);
      if (!skill || skill.level < req.minLevel) {
        return false;
      }
    }
    
    return true;
  }

  private async processLearningEvent(profile: LearningProfile, event: LearningEvent): Promise<void> {
    const experience = this.strategy.calculateExperience(event.metrics, this.defaultConfig);

    // Update affected skills
    for (const skillId of event.skillIds) {
      const skill = profile.skills.get(skillId);
      if (skill) {
        const updatedSkill = this.strategy.updateSkill(skill, experience, this.defaultConfig);
        profile.skills.set(skillId, updatedSkill);
      }
    }

    // Check for specialization unlocks and updates
    for (const [id, spec] of profile.specializations) {
      if (!spec.unlockedAt && this.strategy.shouldUnlockSpecialization(profile.skills, spec, this.defaultConfig)) {
        spec.unlockedAt = new Date();
      }
      if (spec.unlockedAt) {
        const updatedSpec = this.strategy.updateSpecialization(spec, profile.skills, this.defaultConfig);
        profile.specializations.set(id, updatedSpec);
      }
    }
  }

  private async saveProfile(profile: LearningProfile): Promise<void> {
    // Save to database
    await this.prisma.learningProfile.upsert({
      where: { agentId: profile.agentId },
      create: this.mapProfileToDatabase(profile),
      update: this.mapProfileToDatabase(profile),
    });

    // Update cache
    this.learningProfiles.set(profile.agentId, profile);

    // Cache in Redis for quick access
    await this.redis.set(
      `learning:profile:${profile.agentId}`,
      JSON.stringify(profile),
      'EX',
      3600 // 1 hour expiry
    );
  }

  private createNewProfile(agentId: string): LearningProfile {
    return {
      agentId,
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageMetrics: {
        taskSuccess: 0,
        responseQuality: 0,
        executionTime: 0,
        resourceUsage: 0,
        userFeedback: 0,
        timestamp: new Date(),
      },
      recentMetrics: [],
      skills: new Map(),
      specializations: new Map(),
      learningRate: 1,
      lastUpdated: new Date(),
    };
  }

  private calculateAverageMetrics(metrics: LearningMetrics[]): LearningMetrics {
    if (metrics.length === 0) {
      return {
        taskSuccess: 0,
        responseQuality: 0,
        executionTime: 0,
        resourceUsage: 0,
        userFeedback: 0,
        timestamp: new Date(),
      };
    }

    const sum = metrics.reduce(
      (acc, curr) => ({
        taskSuccess: acc.taskSuccess + curr.taskSuccess,
        responseQuality: acc.responseQuality + curr.responseQuality,
        executionTime: acc.executionTime + curr.executionTime,
        resourceUsage: acc.resourceUsage + curr.resourceUsage,
        userFeedback: acc.userFeedback + curr.userFeedback,
        timestamp: new Date(),
      }),
      {
        taskSuccess: 0,
        responseQuality: 0,
        executionTime: 0,
        resourceUsage: 0,
        userFeedback: 0,
        timestamp: new Date(),
      }
    );

    return {
      taskSuccess: sum.taskSuccess / metrics.length,
      responseQuality: sum.responseQuality / metrics.length,
      executionTime: sum.executionTime / metrics.length,
      resourceUsage: sum.resourceUsage / metrics.length,
      userFeedback: sum.userFeedback / metrics.length,
      timestamp: new Date(),
    };
  }

  private mapDatabaseProfile(dbProfile: any): LearningProfile {
    return {
      agentId: dbProfile.agentId,
      totalTasks: dbProfile.totalTasks,
      successfulTasks: dbProfile.successfulTasks,
      failedTasks: dbProfile.failedTasks,
      averageMetrics: JSON.parse(dbProfile.averageMetrics),
      recentMetrics: dbProfile.metrics.map((m: any) => JSON.parse(m.data)),
      skills: new Map(dbProfile.skills.map((s: any) => [s.id, JSON.parse(s.data)])),
      specializations: new Map(dbProfile.specializations.map((s: any) => [s.id, JSON.parse(s.data)])),
      learningRate: dbProfile.learningRate,
      lastUpdated: dbProfile.lastUpdated,
    };
  }

  private mapProfileToDatabase(profile: LearningProfile): any {
    return {
      agentId: profile.agentId,
      totalTasks: profile.totalTasks,
      successfulTasks: profile.successfulTasks,
      failedTasks: profile.failedTasks,
      averageMetrics: JSON.stringify(profile.averageMetrics),
      learningRate: profile.learningRate,
      lastUpdated: profile.lastUpdated,
      skills: {
        deleteMany: {},
        create: Array.from(profile.skills.entries()).map(([id, skill]) => ({
          id,
          data: JSON.stringify(skill),
        })),
      },
      specializations: {
        deleteMany: {},
        create: Array.from(profile.specializations.entries()).map(([id, spec]) => ({
          id,
          data: JSON.stringify(spec),
        })),
      },
      metrics: {
        deleteMany: {},
        create: profile.recentMetrics.map((metric) => ({
          data: JSON.stringify(metric),
          timestamp: metric.timestamp,
        })),
      },
    };
  }
}