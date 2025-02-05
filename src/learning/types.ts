/**
 * Core types for the agent learning system
 */

export interface LearningMetrics {
  taskSuccess: number;  // 0-1 score of task completion success
  responseQuality: number;  // 0-1 score of response quality
  executionTime: number;  // milliseconds
  resourceUsage: number;  // 0-1 score of resource efficiency
  userFeedback: number;  // -1 to 1 score from user feedback
  collaborationScore?: number;  // 0-1 score for collaboration effectiveness
  timestamp: Date;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  dependencies: string[];  // IDs of prerequisite skills
  level: number;  // Current skill level (0-100)
  experience: number;  // Accumulated experience points
  lastUsed: Date;
}

export interface Specialization {
  id: string;
  name: string;
  description: string;
  requiredSkills: string[];  // IDs of required skills
  level: number;  // Specialization level (0-100)
  progress: number;  // Progress to next level (0-100)
  unlockedAt: Date | null;  // When the specialization was unlocked
}

export interface LearningProfile {
  agentId: string;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  averageMetrics: LearningMetrics;
  recentMetrics: LearningMetrics[];  // Last N task metrics
  skills: Map<string, Skill>;
  specializations: Map<string, Specialization>;
  learningRate: number;  // 0-1 score of learning efficiency
  lastUpdated: Date;
}

export interface LearningEvent {
  id: string;
  agentId: string;
  type: LearningEventType;
  metrics: LearningMetrics;
  skillIds: string[];  // Skills used or affected
  specializationIds: string[];  // Specializations affected
  metadata: Record<string, any>;
  timestamp: Date;
}

export enum SkillCategory {
  Technical = 'technical',
  Communication = 'communication',
  ProblemSolving = 'problem_solving',
  ProjectManagement = 'project_management',
  CodeQuality = 'code_quality',
  Security = 'security',
  Performance = 'performance',
  Architecture = 'architecture',
  Testing = 'testing',
  DevOps = 'devops',
  Collaboration = 'collaboration',
}

export enum LearningEventType {
  TaskCompletion = 'task_completion',
  SkillAcquisition = 'skill_acquisition',
  SkillImprovement = 'skill_improvement',
  SpecializationUnlock = 'specialization_unlock',
  SpecializationProgress = 'specialization_progress',
  UserFeedback = 'user_feedback',
  CollaborationSuccess = 'collaboration_success',
  CollaborationFailure = 'collaboration_failure',
  ErrorRecovery = 'error_recovery',
  PerformanceImprovement = 'performance_improvement',
}

export interface SkillRequirement {
  skillId: string;
  minLevel: number;
}

export interface LearningConfig {
  baseExperienceRate: number;  // Base XP gain per task
  levelUpThreshold: number;  // XP needed per level
  maxLevel: number;  // Maximum skill/specialization level
  metricsHistorySize: number;  // Number of recent metrics to keep
  learningRateDecay: number;  // Rate at which learning slows
  specializationThreshold: number;  // Skill level needed for specialization
  feedbackWeight: number;  // Impact of user feedback on learning
  collaborationBonus: number;  // Extra XP for successful collaboration
  skillDecayRate: number;  // Rate at which unused skills decay
  minimumSkillLevel: number;  // Skills won't decay below this
}

export interface LearningStrategy {
  calculateExperience(metrics: LearningMetrics, config: LearningConfig): number;
  updateSkill(skill: Skill, experience: number, config: LearningConfig): Skill;
  updateSpecialization(spec: Specialization, skills: Map<string, Skill>, config: LearningConfig): Specialization;
  calculateLearningRate(profile: LearningProfile, config: LearningConfig): number;
  shouldUnlockSpecialization(skills: Map<string, Skill>, spec: Specialization, config: LearningConfig): boolean;
}