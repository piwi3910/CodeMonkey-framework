// Core message types
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  functionCall?: FunctionCall;
}

export interface FunctionCall {
  name: string;
  arguments: string;
}

// LLM Provider types
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  organizationId?: string;
  modelName: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  functions?: FunctionDefinition[];
  functionCall?: 'auto' | 'none' | { name: string };
  stream?: boolean;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatResponse {
  id: string;
  content: string;
  functionCall?: FunctionCall;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Agent types
export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  provider: string;
  systemPrompt: string;
  state: AgentState;
}

export type AgentRole =
  | 'project_manager'
  | 'architect'
  | 'frontend_developer'
  | 'backend_developer'
  | 'code_reviewer'
  | 'devops'
  | 'qa_engineer';

export interface AgentState {
  currentTask?: string;
  context: Record<string, unknown>;
  memory: {
    shortTerm: Message[];
    longTerm: Message[];
  };
}

// Task types
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'review' | 'completed' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
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
}

// Project types
export interface Project {
  id: string;
  name: string;
  description: string;
  repository?: string;
  status: ProjectStatus;
  agents: Agent[];
  tasks: Task[];
  context: ProjectContext;
}

export type ProjectStatus = 'planning' | 'in_progress' | 'review' | 'completed' | 'archived';

export interface ProjectContext {
  codebase: {
    files: string[];
    dependencies: Record<string, string>;
    architecture: Record<string, unknown>;
  };
  documentation: {
    technical: string[];
    requirements: string[];
    design: string[];
  };
  vectorIndexes: {
    code: string;
    docs: string;
    conversations: string;
  };
}

// API types
export interface ApiRequest {
  messages: Message[];
  functions?: FunctionDefinition[];
  functionCall?: 'auto' | 'none' | { name: string };
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ApiResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: {
    index: number;
    message: Message;
    finishReason: 'stop' | 'length' | 'function_call';
  }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Error types
export class FrameworkError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FrameworkError';
  }
}

export class ValidationError extends FrameworkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends FrameworkError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends FrameworkError {
  constructor(message: string) {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}