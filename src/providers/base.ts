import { Message, ChatOptions, ChatResponse, ProviderConfig } from '../types';

export abstract class LLMProvider {
  constructor(protected config: ProviderConfig) {}

  abstract chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;

  abstract stream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatResponse>;

  protected validateMessages(messages: Message[]): void {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }

    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        throw new Error('Each message must have a role and content');
      }
    }
  }

  protected validateOptions(options?: ChatOptions): void {
    if (options?.temperature !== undefined) {
      if (options.temperature < 0 || options.temperature > 2) {
        throw new Error('Temperature must be between 0 and 2');
      }
    }

    if (options?.maxTokens !== undefined) {
      if (options.maxTokens < 1) {
        throw new Error('Max tokens must be greater than 0');
      }
    }

    if (options?.functions) {
      if (!Array.isArray(options.functions)) {
        throw new Error('Functions must be an array');
      }
      for (const fn of options.functions) {
        if (!fn.name || !fn.description || !fn.parameters) {
          throw new Error('Each function must have a name, description, and parameters');
        }
      }
    }

    if (options?.functionCall) {
      if (
        typeof options.functionCall !== 'string' &&
        typeof options.functionCall !== 'object'
      ) {
        throw new Error('Function call must be a string or object');
      }
      if (
        typeof options.functionCall === 'string' &&
        !['auto', 'none'].includes(options.functionCall)
      ) {
        throw new Error('Function call string must be "auto" or "none"');
      }
      if (
        typeof options.functionCall === 'object' &&
        !options.functionCall.name
      ) {
        throw new Error('Function call object must have a name');
      }
    }
  }

  protected validateConfig(): void {
    if (!this.config.modelName) {
      throw new Error('Model name is required');
    }
  }
}