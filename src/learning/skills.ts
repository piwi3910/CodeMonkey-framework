import { Skill, SkillCategory, Specialization } from './types';

interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  dependencies: string[];
}

interface SpecializationDefinition {
  id: string;
  name: string;
  description: string;
  requiredSkills: string[];
}

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  private specializations: Map<string, SpecializationDefinition> = new Map();

  constructor() {
    this.initializeSkills();
    this.initializeSpecializations();
  }

  private initializeSkills(): void {
    // Technical Skills
    this.registerSkill({
      id: 'code_writing',
      name: 'Code Writing',
      description: 'Ability to write clean, efficient code',
      category: SkillCategory.Technical,
      dependencies: [],
    });

    this.registerSkill({
      id: 'debugging',
      name: 'Debugging',
      description: 'Identifying and fixing code issues',
      category: SkillCategory.Technical,
      dependencies: ['code_writing'],
    });

    this.registerSkill({
      id: 'api_design',
      name: 'API Design',
      description: 'Designing clean and efficient APIs',
      category: SkillCategory.Technical,
      dependencies: ['code_writing'],
    });

    // Architecture Skills
    this.registerSkill({
      id: 'system_design',
      name: 'System Design',
      description: 'Designing scalable system architectures',
      category: SkillCategory.Architecture,
      dependencies: ['api_design'],
    });

    this.registerSkill({
      id: 'pattern_recognition',
      name: 'Pattern Recognition',
      description: 'Identifying and applying design patterns',
      category: SkillCategory.Architecture,
      dependencies: ['system_design'],
    });

    // Code Quality Skills
    this.registerSkill({
      id: 'code_review',
      name: 'Code Review',
      description: 'Reviewing and improving code quality',
      category: SkillCategory.CodeQuality,
      dependencies: ['code_writing', 'debugging'],
    });

    this.registerSkill({
      id: 'refactoring',
      name: 'Refactoring',
      description: 'Improving code structure without changing behavior',
      category: SkillCategory.CodeQuality,
      dependencies: ['code_review'],
    });

    // Testing Skills
    this.registerSkill({
      id: 'unit_testing',
      name: 'Unit Testing',
      description: 'Writing and maintaining unit tests',
      category: SkillCategory.Testing,
      dependencies: ['code_writing'],
    });

    this.registerSkill({
      id: 'integration_testing',
      name: 'Integration Testing',
      description: 'Testing component interactions',
      category: SkillCategory.Testing,
      dependencies: ['unit_testing'],
    });

    // Security Skills
    this.registerSkill({
      id: 'security_analysis',
      name: 'Security Analysis',
      description: 'Identifying security vulnerabilities',
      category: SkillCategory.Security,
      dependencies: ['code_review'],
    });

    // Performance Skills
    this.registerSkill({
      id: 'optimization',
      name: 'Optimization',
      description: 'Improving code and system performance',
      category: SkillCategory.Performance,
      dependencies: ['code_writing', 'debugging'],
    });

    // Collaboration Skills
    this.registerSkill({
      id: 'team_coordination',
      name: 'Team Coordination',
      description: 'Coordinating with other agents',
      category: SkillCategory.Collaboration,
      dependencies: [],
    });

    this.registerSkill({
      id: 'knowledge_sharing',
      name: 'Knowledge Sharing',
      description: 'Effectively sharing information with team',
      category: SkillCategory.Collaboration,
      dependencies: ['team_coordination'],
    });
  }

  private initializeSpecializations(): void {
    // Technical Specializations
    this.registerSpecialization({
      id: 'master_developer',
      name: 'Master Developer',
      description: 'Expert in code development and quality',
      requiredSkills: ['code_writing', 'debugging', 'refactoring', 'optimization'],
    });

    this.registerSpecialization({
      id: 'security_expert',
      name: 'Security Expert',
      description: 'Specialized in code and system security',
      requiredSkills: ['security_analysis', 'code_review', 'system_design'],
    });

    this.registerSpecialization({
      id: 'architecture_expert',
      name: 'Architecture Expert',
      description: 'Expert in system design and patterns',
      requiredSkills: ['system_design', 'pattern_recognition', 'api_design'],
    });

    this.registerSpecialization({
      id: 'testing_expert',
      name: 'Testing Expert',
      description: 'Specialized in comprehensive testing',
      requiredSkills: ['unit_testing', 'integration_testing', 'code_review'],
    });

    this.registerSpecialization({
      id: 'team_leader',
      name: 'Team Leader',
      description: 'Expert in team coordination and knowledge sharing',
      requiredSkills: ['team_coordination', 'knowledge_sharing'],
    });
  }

  private registerSkill(definition: SkillDefinition): void {
    this.skills.set(definition.id, definition);
  }

  private registerSpecialization(definition: SpecializationDefinition): void {
    this.specializations.set(definition.id, definition);
  }

  createSkill(id: string): Skill {
    const definition = this.skills.get(id);
    if (!definition) {
      throw new Error(`Skill ${id} not found in registry`);
    }

    return {
      ...definition,
      level: 0,
      experience: 0,
      lastUsed: new Date(),
    };
  }

  createSpecialization(id: string): Specialization {
    const definition = this.specializations.get(id);
    if (!definition) {
      throw new Error(`Specialization ${id} not found in registry`);
    }

    return {
      ...definition,
      level: 0,
      progress: 0,
      unlockedAt: null,
    };
  }

  getSkillDefinition(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  getSpecializationDefinition(id: string): SpecializationDefinition | undefined {
    return this.specializations.get(id);
  }

  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  getAllSpecializations(): SpecializationDefinition[] {
    return Array.from(this.specializations.values());
  }

  getSkillsByCategory(category: SkillCategory): SkillDefinition[] {
    return this.getAllSkills().filter(skill => skill.category === category);
  }

  getDependentSkills(skillId: string): SkillDefinition[] {
    return this.getAllSkills().filter(skill => 
      skill.dependencies.includes(skillId)
    );
  }

  getPrerequisiteSkills(skillId: string): SkillDefinition[] {
    const skill = this.skills.get(skillId);
    if (!skill) return [];

    return skill.dependencies.map(id => this.skills.get(id)!).filter(Boolean);
  }

  validateSkillDependencies(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    return skill.dependencies.every(id => this.skills.has(id));
  }

  validateSpecializationRequirements(specializationId: string): boolean {
    const specialization = this.specializations.get(specializationId);
    if (!specialization) return false;

    return specialization.requiredSkills.every(id => this.skills.has(id));
  }
}