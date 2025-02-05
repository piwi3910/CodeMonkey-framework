import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

// Provider type
const ProviderType = z.enum(['claude', 'openai', 'openrouter', 'ollama']);
type Provider = z.infer<typeof ProviderType>;

// Connection settings schema
const ConnectionSettings = z.object({
  host: z.string(),
  port: z.number(),
  tls: z.boolean().default(false),
  password: z.string().optional(),
});

// Agent LLM config type
interface AgentLLMConfig {
  provider: Provider;
  model: string;
}

// Environment variable schema
const envSchema = z.object({
  // Server
  PORT: z.string().transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGINS: z.string(),

  // Database
  DATABASE_URL: z.string(),
  
  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.string().transform((val) => val === 'true').default('false'),
  
  // ChromaDB
  CHROMADB_HOST: z.string().default('localhost'),
  CHROMADB_PORT: z.string().transform(Number).default('8000'),
  CHROMADB_API_KEY: z.string().optional(),
  CHROMADB_TLS: z.string().transform((val) => val === 'true').default('false'),
  
  // LLM Providers
  CLAUDE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  
  // Ollama
  OLLAMA_BASE_URL: z.string().optional(),
  OLLAMA_TLS: z.string().transform((val) => val === 'true').default('false'),
  
  // Agent LLM Configurations
  AGENT_PROJECT_MANAGER_PROVIDER: z.string().optional(),
  AGENT_PROJECT_MANAGER_MODEL: z.string().optional(),
  AGENT_ARCHITECT_PROVIDER: z.string().optional(),
  AGENT_ARCHITECT_MODEL: z.string().optional(),
  AGENT_FRONTEND_DEVELOPER_PROVIDER: z.string().optional(),
  AGENT_FRONTEND_DEVELOPER_MODEL: z.string().optional(),
  AGENT_BACKEND_DEVELOPER_PROVIDER: z.string().optional(),
  AGENT_BACKEND_DEVELOPER_MODEL: z.string().optional(),
  AGENT_CODE_REVIEWER_PROVIDER: z.string().optional(),
  AGENT_CODE_REVIEWER_MODEL: z.string().optional(),
  AGENT_DEVOPS_PROVIDER: z.string().optional(),
  AGENT_DEVOPS_MODEL: z.string().optional(),
  AGENT_QA_ENGINEER_PROVIDER: z.string().optional(),
  AGENT_QA_ENGINEER_MODEL: z.string().optional(),
  
  // Default provider settings
  DEFAULT_PROVIDER: ProviderType.default('claude'),
  DEFAULT_MODEL: z.string().default('claude-3-opus-20240229'),
  
  // Agent settings
  AGENT_MEMORY_TTL: z.string().transform(Number).default('3600'),
  MAX_CONCURRENT_TASKS: z.string().transform(Number).default('5'),
  
  // Security
  API_KEY_SALT: z.string(),
  JWT_SECRET: z.string(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'text']).default('json'),
});

// Parse and validate environment variables
const env = envSchema.safeParse(process.env);

if (!env.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(env.error.format(), null, 2));
  process.exit(1);
}

const data = env.data;

// Helper function to create agent LLM config
function createAgentLLMConfig(provider?: string, model?: string): AgentLLMConfig {
  return {
    provider: (provider as Provider) || data.DEFAULT_PROVIDER,
    model: model || data.DEFAULT_MODEL,
  };
}

// Export validated environment variables
export const config = {
  server: {
    port: data.PORT,
    nodeEnv: data.NODE_ENV,
    corsOrigins: data.CORS_ORIGINS.split(','),
  },
  
  database: {
    url: data.DATABASE_URL,
  },
  
  redis: {
    host: data.REDIS_HOST,
    port: data.REDIS_PORT,
    password: data.REDIS_PASSWORD,
    tls: data.REDIS_TLS,
  },
  
  chromadb: {
    host: data.CHROMADB_HOST,
    port: data.CHROMADB_PORT,
    apiKey: data.CHROMADB_API_KEY,
    tls: data.CHROMADB_TLS,
  },
  
  llm: {
    defaultProvider: data.DEFAULT_PROVIDER,
    defaultModel: data.DEFAULT_MODEL,
    claude: {
      apiKey: data.CLAUDE_API_KEY,
    },
    openai: {
      apiKey: data.OPENAI_API_KEY,
    },
    openrouter: {
      apiKey: data.OPENROUTER_API_KEY,
    },
    ollama: {
      baseUrl: data.OLLAMA_BASE_URL,
      tls: data.OLLAMA_TLS,
    },
  },

  agents: {
    projectManager: createAgentLLMConfig(
      data.AGENT_PROJECT_MANAGER_PROVIDER,
      data.AGENT_PROJECT_MANAGER_MODEL
    ),
    architect: createAgentLLMConfig(
      data.AGENT_ARCHITECT_PROVIDER,
      data.AGENT_ARCHITECT_MODEL
    ),
    frontendDeveloper: createAgentLLMConfig(
      data.AGENT_FRONTEND_DEVELOPER_PROVIDER,
      data.AGENT_FRONTEND_DEVELOPER_MODEL
    ),
    backendDeveloper: createAgentLLMConfig(
      data.AGENT_BACKEND_DEVELOPER_PROVIDER,
      data.AGENT_BACKEND_DEVELOPER_MODEL
    ),
    codeReviewer: createAgentLLMConfig(
      data.AGENT_CODE_REVIEWER_PROVIDER,
      data.AGENT_CODE_REVIEWER_MODEL
    ),
    devops: createAgentLLMConfig(
      data.AGENT_DEVOPS_PROVIDER,
      data.AGENT_DEVOPS_MODEL
    ),
    qaEngineer: createAgentLLMConfig(
      data.AGENT_QA_ENGINEER_PROVIDER,
      data.AGENT_QA_ENGINEER_MODEL
    ),
  },
  
  agent: {
    memoryTtl: data.AGENT_MEMORY_TTL,
    maxConcurrentTasks: data.MAX_CONCURRENT_TASKS,
  },
  
  security: {
    apiKeySalt: data.API_KEY_SALT,
    jwtSecret: data.JWT_SECRET,
  },

  logging: {
    level: data.LOG_LEVEL,
    format: data.LOG_FORMAT,
  },
} as const;

// Type for the config object
export type Config = typeof config;