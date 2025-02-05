/**
 * Types for the cross-agent collaboration system
 */

export enum CollaborationType {
  TaskDelegation = 'task_delegation',
  ConsensusBuilding = 'consensus_building',
  PeerReview = 'peer_review',
  KnowledgeSharing = 'knowledge_sharing',
  ProblemSolving = 'problem_solving',
  CodeReview = 'code_review',
  ArchitectureReview = 'architecture_review',
  QualityAssurance = 'quality_assurance',
}

export enum CollaborationStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum CollaborationRole {
  Initiator = 'initiator',
  Participant = 'participant',
  Reviewer = 'reviewer',
  Observer = 'observer',
}

export interface CollaborationParticipant {
  agentId: string;
  role: CollaborationRole;
  status: CollaborationStatus;
  contribution?: string;
  feedback?: string;
  timestamp: Date;
}

export interface CollaborationContext {
  taskId?: string;
  projectId: string;
  resources: string[];  // IDs or URIs of relevant resources
  constraints?: {
    deadline?: Date;
    maxParticipants?: number;
    requiredSkills?: string[];
    qualityThreshold?: number;
  };
  metadata: Record<string, any>;
}

export interface CollaborationWorkflow {
  steps: CollaborationStep[];
  currentStep: number;
  status: CollaborationStatus;
  startTime: Date;
  endTime?: Date;
  results?: any;
}

export interface CollaborationStep {
  id: string;
  type: CollaborationType;
  description: string;
  assignee?: string;  // Agent ID
  reviewers?: string[];  // Agent IDs
  status: CollaborationStatus;
  startTime?: Date;
  endTime?: Date;
  artifacts?: CollaborationArtifact[];
  dependencies?: string[];  // Step IDs
  validation?: StepValidation;
}

export interface StepValidation {
  criteria: string[];
  threshold: number;  // 0-1 range for validation score threshold
  results?: ValidationResult[];
}

export interface CollaborationArtifact {
  id: string;
  type: string;
  content: string;
  metadata: {
    creator: string;
    timestamp: Date;
    version: string;
    tags: string[];
  };
  validation?: ValidationResult[];
}

export interface ValidationResult {
  validator: string;  // Agent ID
  timestamp: Date;
  passed: boolean;
  score?: number;
  feedback: string;
  details?: Record<string, any>;
}

export interface CollaborationMetrics {
  duration: number;  // milliseconds
  participantCount: number;
  messageCount: number;
  artifactCount: number;
  consensusRate: number;  // 0-1
  qualityScore: number;  // 0-1
  efficiency: number;  // 0-1
  successRate: number;  // 0-1
}

export interface CollaborationProtocol {
  type: CollaborationType;
  roles: CollaborationRole[];
  steps: {
    name: string;
    description: string;
    assignedRole: CollaborationRole;
    requiredArtifacts?: string[];
    validation?: {
      criteria: string[];
      validators: CollaborationRole[];
      threshold: number;  // 0-1 range
    };
  }[];
  rules: {
    minParticipants?: number;
    maxParticipants?: number;
    requiredRoles: CollaborationRole[];
    timeoutMinutes?: number;
    qualityThreshold?: number;
    consensusThreshold?: number;
  };
}

export interface CollaborationSession {
  id: string;
  type: CollaborationType;
  status: CollaborationStatus;
  participants: CollaborationParticipant[];
  context: CollaborationContext;
  workflow: CollaborationWorkflow;
  protocol: CollaborationProtocol;
  metrics?: CollaborationMetrics;
  createdAt: Date;
  updatedAt: Date;
}

export interface CollaborationMessage {
  id: string;
  sessionId: string;
  senderId: string;
  recipientId?: string;
  type: 'proposal' | 'feedback' | 'consensus' | 'artifact' | 'validation' | 'status';
  content: string;
  metadata: {
    stepId?: string;
    artifactId?: string;
    timestamp: Date;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
  };
}

export interface CollaborationQuery {
  sessionId?: string;
  type?: CollaborationType;
  status?: CollaborationStatus;
  participantId?: string;
  role?: CollaborationRole;
  timeRange?: {
    start: Date;
    end: Date;
  };
  metadata?: Record<string, any>;
}

export interface CollaborationStats {
  totalSessions: number;
  activeParticipants: number;
  averageDuration: number;
  successRate: number;
  byType: Record<CollaborationType, number>;
  byStatus: Record<CollaborationStatus, number>;
  averageMetrics: CollaborationMetrics;
}

// Database Types
export type DatabaseCollaborationSession = {
  id: string;
  type: string;
  status: string;
  context: string;
  workflow: string;
  protocol: string;
  metrics: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: DatabaseCollaborationParticipant[];
  messages: DatabaseCollaborationMessage[];
};

export type DatabaseCollaborationParticipant = {
  id: string;
  sessionId: string;
  agentId: string;
  role: string;
  status: string;
  contribution: string | null;
  feedback: string | null;
  timestamp: Date;
};

export type DatabaseCollaborationMessage = {
  id: string;
  sessionId: string;
  senderId: string;
  recipientId: string | null;
  type: string;
  content: string;
  metadata: string;
  createdAt: Date;
};