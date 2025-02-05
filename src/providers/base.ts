import { ChatOptions, ChatResponse, Message, ProviderConfig } from '../types';

export abstract class LLMProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  
  abstract stream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterator<ChatResponse>;

  protected validateConfig(): void {
    if (!this.config.modelName) {
      throw new Error('Model name is required');
    }
    if (!this.config.apiKey) {
      throw new Error('API key is required');
    }
  }

  protected validateMessages(messages: Message[]): void {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('At least one message is required');
    }

    for (const message of messages) {
      if (!message.role || !message.content) {
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
      for (const func of options.functions) {
        if (!func.name || !func.description || !func.parameters) {
          throw new Error('Functions must have name, description, and parameters');
        }
      }
    }
  }
}