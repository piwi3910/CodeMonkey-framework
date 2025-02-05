import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

// Environment variable schema
const envSchema = z.object({
  // Server
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string(),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // ChromaDB
  CHROMADB_HOST: z.string().default('localhost'),
  CHROMADB_PORT: z.string().default('8000'),
  
  // LLM Providers
  CLAUDE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),
  
  // Default provider settings
  DEFAULT_PROVIDER: z.enum(['claude', 'openai', 'openrouter', 'ollama']).default('claude'),
  DEFAULT_MODEL: z.string().default('claude-3-opus-20240229'),
  
  // Agent settings
  AGENT_MEMORY_TTL: z.string().default('3600'), // 1 hour in seconds
  MAX_CONCURRENT_TASKS: z.string().default('5'),
  
  // Security
  API_KEY_SALT: z.string(),
  JWT_SECRET: z.string(),
  CORS_ORIGINS: z.string().default('*'),
});

// Parse and validate environment variables
const env = envSchema.safeParse(process.env);

if (!env.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(env.error.format(), null, 2));
  process.exit(1);
}

// Export validated environment variables
export const config = {
  server: {
    port: parseInt(env.data.PORT, 10),
    nodeEnv: env.data.NODE_ENV,
    corsOrigins: env.data.CORS_ORIGINS.split(','),
  },
  
  database: {
    url: env.data.DATABASE_URL,
  },
  
  redis: {
    url: env.data.REDIS_URL,
  },
  
  chromadb: {
    host: env.data.CHROMADB_HOST,
    port: parseInt(env.data.CHROMADB_PORT, 10),
  },
  
  llm: {
    defaultProvider: env.data.DEFAULT_PROVIDER,
    defaultModel: env.data.DEFAULT_MODEL,
    claude: {
      apiKey: env.data.CLAUDE_API_KEY,
    },
    openai: {
      apiKey: env.data.OPENAI_API_KEY,
    },
    openrouter: {
      apiKey: env.data.OPENROUTER_API_KEY,
    },
    ollama: {
      baseUrl: env.data.OLLAMA_BASE_URL,
    },
  },
  
  agent: {
    memoryTtl: parseInt(env.data.AGENT_MEMORY_TTL, 10),
    maxConcurrentTasks: parseInt(env.data.MAX_CONCURRENT_TASKS, 10),
  },
  
  security: {
    apiKeySalt: env.data.API_KEY_SALT,
    jwtSecret: env.data.JWT_SECRET,
  },
} as const;

// Type for the config object
export type Config = typeof config;