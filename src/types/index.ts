// Agent Types
export type AgentRole =
  | 'project_manager'
  | 'architect'
  | 'frontend_developer'
  | 'backend_developer'
  | 'code_reviewer'
  | 'devops'
  | 'qa_engineer';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments?: string;
  };
}

// Task Types
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dependencies: string[];
  projectId: string;
  agentId: string | null | undefined;
  createdAt?: Date;
  updatedAt?: Date;
}

// Agent State Types
export interface AgentState {
  id: string;
  agentId: string;
  context: string;
  shortTerm: string;
  longTerm: string;
  updatedAt: Date;
}

// Error Types
export class FrameworkError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'FrameworkError';
  }
}

// Documentation Types
export type DocumentationType = 
  | 'api' 
  | 'architecture' 
  | 'technical' 
  | 'design'
  | 'learning_event'
  | 'skill_data'
  | 'agent_profile'
  | 'memory'
  | 'code'
  | 'test'
  | 'metric'
  | 'documentation';

export interface DocumentationMetadata {
  projectId: string;
  type: DocumentationType;
  title: string;
  timestamp: string;
  agentId?: string;
  category?: string;
  version?: string;
  tags?: string[];
}

// Provider Types
export interface ProviderConfig {
  apiKey?: string;
  modelName: string;
  baseUrl?: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  functions?: any[];
  functionCall?: 'auto' | 'none' | { name: string };
}

export interface ChatResponse {
  id: string;
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  functionCall?: {
    name: string;
    arguments: string;
  };
}

// Memory Types
export interface Memory {
  id: string;
  content: string;
  type: 'shortTerm' | 'longTerm';
  timestamp: Date;
  metadata: {
    source: string;
    context?: string;
    importance?: number;
    category?: string;
  };
}

// Context Types
export interface AgentContext {
  currentTask?: {
    id: string;
    title: string;
    description: string;
  };
  recentMemories: Memory[];
  projectContext: {
    architecture?: string;
    technical?: string;
    requirements?: string;
  };
  customContext?: Record<string, any>;
}

// Project Types
export interface Project {
  id: string;
  name: string;
  description: string;
  agents: {
    id: string;
    name: string;
    role: AgentRole;
  }[];
  tasks: Task[];
  context?: {
    architecture: string;
    technical: string;
    requirements: string;
    dependencies: string;
  };
}

// Monitoring Types
export interface PerformanceMetrics {
  responseTime: number;
  tokenUsage: number;
  memoryUsage: number;
  taskSuccess: boolean;
  errorCount: number;
  timestamp: Date;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'failing';
  components: {
    name: string;
    status: 'up' | 'down' | 'degraded';
    lastCheck: Date;
    metrics?: Record<string, number>;
  }[];
  lastUpdated: Date;
}

// Function Calling Types
export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface FunctionCall {
  name: string;
  arguments: string;
}