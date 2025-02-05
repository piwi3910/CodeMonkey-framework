import {
  LearningMetrics,
  LearningConfig,
  Skill,
  Specialization,
  LearningProfile,
  LearningStrategy,
} from './types';

export class DefaultLearningStrategy implements LearningStrategy {
  calculateExperience(metrics: LearningMetrics, config: LearningConfig): number {
    // Base experience from task completion
    let experience = config.baseExperienceRate;

    // Adjust based on task success
    experience *= metrics.taskSuccess;

    // Bonus for high-quality responses
    experience *= (1 + metrics.responseQuality * 0.5);

    // Efficiency bonus for good resource usage
    if (metrics.resourceUsage < 0.5) {
      experience *= 1.2;
    }

    // Time efficiency bonus
    const averageTime = 5000; // 5 seconds baseline
    if (metrics.executionTime < averageTime) {
      experience *= 1.1;
    }

    // User feedback multiplier
    const feedbackMultiplier = 1 + (metrics.userFeedback * config.feedbackWeight);
    experience *= feedbackMultiplier;

    // Collaboration bonus
    if (metrics.collaborationScore) {
      experience *= (1 + config.collaborationBonus * metrics.collaborationScore);
    }

    return Math.round(experience);
  }

  updateSkill(skill: Skill, experience: number, config: LearningConfig): Skill {
    const updatedSkill = { ...skill };
    
    // Add new experience
    updatedSkill.experience += experience;

    // Calculate new level
    const newLevel = Math.floor(updatedSkill.experience / config.levelUpThreshold);
    
    // Cap at max level
    updatedSkill.level = Math.min(newLevel, config.maxLevel);

    // Apply skill decay if not used recently
    const daysSinceLastUse = Math.floor(
      (Date.now() - updatedSkill.lastUsed.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastUse > 7) { // Decay after a week of non-use
      const decayFactor = Math.pow(1 - config.skillDecayRate, daysSinceLastUse - 7);
      updatedSkill.level = Math.max(
        config.minimumSkillLevel,
        Math.floor(updatedSkill.level * decayFactor)
      );
    }

    updatedSkill.lastUsed = new Date();

    return updatedSkill;
  }

  updateSpecialization(
    spec: Specialization,
    skills: Map<string, Skill>,
    config: LearningConfig
  ): Specialization {
    const updatedSpec = { ...spec };

    // Check if all required skills meet the threshold
    const meetsRequirements = spec.requiredSkills.every(skillId => {
      const skill = skills.get(skillId);
      return skill && skill.level >= config.specializationThreshold;
    });

    if (!meetsRequirements) {
      return updatedSpec;
    }

    // Calculate average level of required skills
    const avgSkillLevel = spec.requiredSkills.reduce((sum, skillId) => {
      const skill = skills.get(skillId);
      return sum + (skill?.level || 0);
    }, 0) / spec.requiredSkills.length;

    // Progress is based on how far above threshold the skills are
    const progressIncrease = Math.max(0, avgSkillLevel - config.specializationThreshold);
    updatedSpec.progress += progressIncrease;

    // Level up if progress reaches 100
    while (updatedSpec.progress >= 100) {
      updatedSpec.level = Math.min(updatedSpec.level + 1, config.maxLevel);
      updatedSpec.progress -= 100;
    }

    return updatedSpec;
  }

  calculateLearningRate(profile: LearningProfile, config: LearningConfig): number {
    // Start with base learning rate
    let rate = 1.0;

    // Adjust based on recent success rate
    const successRate = profile.successfulTasks / Math.max(1, profile.totalTasks);
    rate *= (0.5 + successRate);

    // Decay based on total experience
    const experienceDecay = Math.pow(
      config.learningRateDecay,
      Math.floor(profile.totalTasks / 100)
    );
    rate *= experienceDecay;

    // Boost for balanced skill development
    const skillLevels = Array.from(profile.skills.values()).map(s => s.level);
    const avgLevel = skillLevels.reduce((a, b) => a + b, 0) / skillLevels.length;
    const levelVariance = skillLevels.reduce((sum, level) => 
      sum + Math.pow(level - avgLevel, 2), 0) / skillLevels.length;
    
    if (levelVariance < 100) { // Low variance means balanced development
      rate *= 1.1;
    }

    // Recent performance trend
    const recentMetrics = profile.recentMetrics.slice(-10);
    if (recentMetrics.length > 0) {
      const avgSuccess = recentMetrics.reduce((sum, m) => 
        sum + m.taskSuccess, 0) / recentMetrics.length;
      rate *= (0.8 + avgSuccess * 0.4);
    }

    return Math.max(0.1, Math.min(2.0, rate));
  }

  shouldUnlockSpecialization(
    skills: Map<string, Skill>,
    spec: Specialization,
    config: LearningConfig
  ): boolean {
    // Check if already unlocked
    if (spec.unlockedAt) {
      return false;
    }

    // Verify all required skills meet the threshold
    return spec.requiredSkills.every(skillId => {
      const skill = skills.get(skillId);
      return skill && skill.level >= config.specializationThreshold;
    });
  }
}