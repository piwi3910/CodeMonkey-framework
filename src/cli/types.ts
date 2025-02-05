/**
 * Types for the CLI tool system
 */

export type CommandType = 
  | 'agent'
  | 'project'
  | 'task'
  | 'memory'
  | 'learning'
  | 'collaboration'
  | 'debug'
  | 'monitor';

export type SubCommandType = {
  agent: 'create' | 'list' | 'info' | 'delete' | 'update' | 'skills' | 'metrics';
  project: 'create' | 'list' | 'info' | 'delete' | 'update' | 'status';
  task: 'create' | 'list' | 'info' | 'delete' | 'update' | 'assign' | 'start' | 'complete';
  memory: 'query' | 'stats' | 'consolidate' | 'clear';
  learning: 'stats' | 'skills' | 'specializations' | 'reset';
  collaboration: 'create' | 'list' | 'info' | 'join' | 'message' | 'stats';
  debug: 'logs' | 'trace' | 'replay' | 'inspect';
  monitor: 'status' | 'metrics' | 'alerts' | 'performance';
};

export interface CommandOption {
  name: string;
  alias?: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required?: boolean;
  default?: any;
  choices?: string[];
}

export interface CommandDefinition {
  command: CommandType;
  subCommand: SubCommandType[CommandType];
  description: string;
  options: CommandOption[];
  examples: string[];
}

export interface CommandContext {
  projectId?: string;
  agentId?: string;
  workingDirectory: string;
  configPath: string;
  debug: boolean;
}

export interface CommandResult {
  success: boolean;
  data?: any;
  error?: string;
  warnings?: string[];
}

export interface CliConfig {
  defaultProject?: string;
  defaultAgent?: string;
  editor?: string;
  theme?: {
    primary: string;
    secondary: string;
    success: string;
    error: string;
    warning: string;
  };
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
  };
  display?: {
    compact: boolean;
    colors: boolean;
    timestamps: boolean;
  };
}

export interface CommandHandler {
  execute(
    subCommand: SubCommandType[CommandType],
    options: Record<string, any>,
    context: CommandContext
  ): Promise<CommandResult>;
}

export interface CommandRegistry {
  registerCommand(definition: CommandDefinition, handler: CommandHandler): void;
  getCommand(command: CommandType, subCommand: string): {
    definition: CommandDefinition;
    handler: CommandHandler;
  } | undefined;
  listCommands(): CommandDefinition[];
}