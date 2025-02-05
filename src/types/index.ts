import { Prisma } from '@prisma/client';

// Prisma Model Types with Relations
export type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    agents: true;
    tasks: true;
    context: true;
  };
}>;

export type AgentWithRelations = Prisma.AgentGetPayload<{
  include: {
    project: true;
    tasks: true;
    state: true;
    learningProfile: true;
  };
}>;

export type TaskWithRelations = Prisma.TaskGetPayload<{
  include: {
    project: true;
    agent: true;
  };
}>;

export type AgentStateWithRelations = Prisma.AgentStateGetPayload<{
  include: {
    agent: true;
  };
}>;

export type ProjectContextWithRelations = Prisma.ProjectContextGetPayload<{
  include: {
    project: true;
  };
}>;

// Re-export base types for backward compatibility
export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dependencies: string[];
  projectId: string;
  agentId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  project?: ProjectWithRelations;
  agent?: AgentWithRelations | null;
};

export type AgentState = {
  id: string;
  agentId: string;
  context: string;
  shortTerm: string;
  longTerm: string;
  currentTask: string | null;
  updatedAt: Date;
  agent?: AgentWithRelations;
};

export type ProjectContext = {
  id: string;
  projectId: string;
  architecture: string;
  technical: string;
  requirements: string;
  dependencies: string;
  updatedAt: Date;
  project?: ProjectWithRelations;
};

export type FunctionCallType = 'none' | 'auto' | { name: string };

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments?: string;
  };
}

export enum TaskStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
  Blocked = 'blocked',
}

export enum TaskPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

export type DocumentationType = 
  | 'code'
  | 'architecture'
  | 'requirements'
  | 'memory'
  | 'learning'
  | 'collaboration'
  | 'technical'
  | 'api'
  | 'metric'
  | 'learning_event';

export interface DocumentationMetadata {
  projectId: string;
  type?: DocumentationType;
  nResults?: number;
  category?: string;
  tags?: string[];
}

export interface DocumentationResult {
  content: string;
  metadata: {
    title: string;
    type: DocumentationType;
    category?: string;
    tags: string[];
    timestamp: string;
    similarity?: number;
    context?: string;
  };
}

export interface ProviderConfig {
  apiKey: string;
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface ChatFunction {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  functionCall?: FunctionCallType;
  functions?: ChatFunction[];
}

export interface ChatResponse {
  id: string;
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  functionCall?: {
    name: string;
    arguments: string;
  };
}

export interface TaskResult {
  success: boolean;
  message: string;
  artifacts?: string[];
  metrics?: {
    duration: number;
    resourceUsage: number;
    quality: number;
  };
}

export interface CodeReviewResult {
  issues: {
    file: string;
    line: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
  }[];
  summary: string;
  score: number;
  suggestions: string[];
}

export interface ImprovementSuggestion {
  category: 'performance' | 'security' | 'maintainability' | 'architecture';
  priority: 'low' | 'medium' | 'high';
  description: string;
  impact: string;
  effort: string;
  implementation?: string;
}

// Provider-specific configs
export interface ClaudeConfig extends ProviderConfig {
  organizationId?: string;
  stopSequences?: string[];
}

export interface OpenAIConfig extends ProviderConfig {
  organization?: string;
  stopSequences?: string[];
}

export interface OpenRouterConfig extends ProviderConfig {
  routePreference?: string;
  stopSequences?: string[];
}

export interface OllamaConfig extends ProviderConfig {
  baseUrl?: string;
  stopSequences?: string[];
}

// Provider-specific chat options
export interface ClaudeChatOptions extends ChatOptions {
  organizationId?: string;
}

export interface OpenAIChatOptions extends ChatOptions {
  organization?: string;
}

export interface OpenRouterChatOptions extends ChatOptions {
  routePreference?: string;
}

export interface OllamaChatOptions extends ChatOptions {
  baseUrl?: string;
}