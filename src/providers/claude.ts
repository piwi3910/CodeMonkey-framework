import Anthropic from '@anthropic-ai/sdk';
import { ChatOptions, ChatResponse, Message, ProviderConfig } from '../types';
import { LLMProvider } from './base';

export interface ClaudeConfig extends ProviderConfig {
  modelName: 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240229';
}

export class ClaudeProvider extends LLMProvider {
  private client: Anthropic;

  constructor(config: ClaudeConfig) {
    super(config);
    this.validateConfig();
    this.client = new Anthropic({
      apiKey: config.apiKey!,
    });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    this.validateMessages(messages);
    this.validateOptions(options);

    const anthropicMessages = this.convertToAnthropicMessages(messages);

    try {
      const response = await this.client.messages.create({
        model: this.config.modelName,
        messages: anthropicMessages,
        max_tokens: options?.maxTokens,
        temperature: options?.temperature,
        system: this.extractSystemMessage(messages),
        stream: false,
      });

      return {
        id: response.id,
        content: response.content[0].text,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async *stream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterator<ChatResponse> {
    this.validateMessages(messages);
    this.validateOptions(options);

    const anthropicMessages = this.convertToAnthropicMessages(messages);

    try {
      const stream = await this.client.messages.create({
        model: this.config.modelName,
        messages: anthropicMessages,
        max_tokens: options?.maxTokens,
        temperature: options?.temperature,
        system: this.extractSystemMessage(messages),
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.type === 'message_delta') {
          yield {
            id: chunk.id,
            content: chunk.delta?.text || '',
          };
        }
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private convertToAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));
  }

  private extractSystemMessage(messages: Message[]): string | undefined {
    const systemMessage = messages.find((msg) => msg.role === 'system');
    return systemMessage?.content;
  }

  private handleError(error: unknown): Error {
    if (error instanceof Anthropic.APIError) {
      return new Error(`Claude API error: ${error.message}`);
    }
    if (error instanceof Error) {
      return error;
    }
    return new Error('Unknown error occurred');
  }
}