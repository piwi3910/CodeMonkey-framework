import {
  CommandType,
  SubCommandType,
  CommandDefinition,
  CommandHandler,
  CommandRegistry,
  CommandContext,
  CommandResult,
  CommandOption,
} from './types';

export class DefaultCommandRegistry implements CommandRegistry {
  private commands: Map<string, {
    definition: CommandDefinition;
    handler: CommandHandler;
  }> = new Map();

  registerCommand(definition: CommandDefinition, handler: CommandHandler): void {
    const key = this.getCommandKey(definition.command, definition.subCommand);
    this.commands.set(key, { definition, handler });
  }

  getCommand(command: CommandType, subCommand: string): {
    definition: CommandDefinition;
    handler: CommandHandler;
  } | undefined {
    const key = this.getCommandKey(command, subCommand as any);
    return this.commands.get(key);
  }

  listCommands(): CommandDefinition[] {
    return Array.from(this.commands.values()).map(c => c.definition);
  }

  async executeCommand(
    command: CommandType,
    subCommand: SubCommandType[CommandType],
    options: Record<string, any>,
    context: CommandContext
  ): Promise<CommandResult> {
    const cmd = this.getCommand(command, subCommand);
    if (!cmd) {
      return {
        success: false,
        error: `Unknown command: ${command} ${subCommand}`,
      };
    }

    try {
      // Validate options
      this.validateOptions(cmd.definition, options);

      // Execute command
      return await cmd.handler.execute(subCommand, options, context);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private getCommandKey(command: CommandType, subCommand: SubCommandType[CommandType]): string {
    return `${command}:${subCommand}`;
  }

  private validateOptions(
    definition: CommandDefinition,
    options: Record<string, any>
  ): void {
    // Check required options
    for (const opt of definition.options) {
      if (opt.required && !(opt.name in options)) {
        throw new Error(`Missing required option: ${opt.name}`);
      }
    }

    // Validate option types and choices
    for (const [key, value] of Object.entries(options)) {
      const opt = definition.options.find(o => o.name === key);
      if (!opt) continue;

      // Check type
      switch (opt.type) {
        case 'string':
          if (typeof value !== 'string') {
            throw new Error(`Option ${key} must be a string`);
          }
          break;
        case 'number':
          if (typeof value !== 'number') {
            throw new Error(`Option ${key} must be a number`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            throw new Error(`Option ${key} must be a boolean`);
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            throw new Error(`Option ${key} must be an array`);
          }
          break;
      }

      // Check choices
      if (opt.choices && !opt.choices.includes(value.toString())) {
        throw new Error(
          `Invalid value for ${key}. Must be one of: ${opt.choices.join(', ')}`
        );
      }
    }
  }
}

// Command handler implementations
export abstract class BaseCommandHandler implements CommandHandler {
  abstract execute(
    subCommand: SubCommandType[CommandType],
    options: Record<string, any>,
    context: CommandContext
  ): Promise<CommandResult>;

  protected formatResult(data: any): CommandResult {
    return {
      success: true,
      data,
    };
  }

  protected formatError(error: string | Error): CommandResult {
    return {
      success: false,
      error: error instanceof Error ? error.message : error,
    };
  }

  protected formatWarning(data: any, warnings: string[]): CommandResult {
    return {
      success: true,
      data,
      warnings,
    };
  }
}

// Helper for building command definitions
export class CommandBuilder {
  private definition: Partial<CommandDefinition> = {};

  setCommand(command: CommandType): CommandBuilder {
    this.definition.command = command;
    return this;
  }

  setSubCommand(subCommand: SubCommandType[CommandType]): CommandBuilder {
    this.definition.subCommand = subCommand;
    return this;
  }

  setDescription(description: string): CommandBuilder {
    this.definition.description = description;
    return this;
  }

  addOption(option: CommandOption): CommandBuilder {
    this.definition.options = this.definition.options || [];
    this.definition.options.push(option);
    return this;
  }

  addExample(example: string): CommandBuilder {
    this.definition.examples = this.definition.examples || [];
    this.definition.examples.push(example);
    return this;
  }

  build(): CommandDefinition {
    if (!this.definition.command) {
      throw new Error('Command is required');
    }
    if (!this.definition.subCommand) {
      throw new Error('SubCommand is required');
    }
    if (!this.definition.description) {
      throw new Error('Description is required');
    }
    if (!this.definition.options) {
      this.definition.options = [];
    }
    if (!this.definition.examples) {
      this.definition.examples = [];
    }

    return this.definition as CommandDefinition;
  }
}

// Example usage:
/*
const registry = new DefaultCommandRegistry();

const agentListCommand = new CommandBuilder()
  .setCommand('agent')
  .setSubCommand('list')
  .setDescription('List all agents')
  .addOption({
    name: 'project',
    description: 'Filter by project ID',
    type: 'string',
    required: false,
  })
  .addExample('codemonkey agent list')
  .addExample('codemonkey agent list --project my-project')
  .build();

class AgentListHandler extends BaseCommandHandler {
  async execute(
    subCommand: SubCommandType['agent'],
    options: Record<string, any>,
    context: CommandContext
  ): Promise<CommandResult> {
    try {
      const agents = await listAgents(options.project);
      return this.formatResult(agents);
    } catch (error) {
      return this.formatError(error);
    }
  }
}

registry.registerCommand(agentListCommand, new AgentListHandler());
*/