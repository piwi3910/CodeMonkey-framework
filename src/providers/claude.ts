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
    const systemMessage = this.extractSystemMessage(messages);

    try {
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: this.config.modelName,
        messages: anthropicMessages,
        max_tokens: options?.maxTokens || 1024,
        stream: false,
      };

      if (systemMessage) {
        params.system = systemMessage;
      }

      if (options?.temperature !== undefined) {
        params.temperature = options.temperature;
      }

      const response = await this.client.messages.create(params);

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
  ): AsyncIterable<ChatResponse> {
    this.validateMessages(messages);
    this.validateOptions(options);

    const anthropicMessages = this.convertToAnthropicMessages(messages);
    const systemMessage = this.extractSystemMessage(messages);

    try {
      const params: Anthropic.MessageCreateParamsStreaming = {
        model: this.config.modelName,
        messages: anthropicMessages,
        max_tokens: options?.maxTokens || 1024,
        stream: true,
      };

      if (systemMessage) {
        params.system = systemMessage;
      }

      if (options?.temperature !== undefined) {
        params.temperature = options.temperature;
      }

      const stream = await this.client.messages.create(params);

      if (!('iterator' in stream)) {
        throw new Error('Expected streaming response');
      }

      let currentMessageId = '';

      for await (const event of stream) {
        if (event.type === 'message_start') {
          currentMessageId = event.message.id;
        } else if (event.type === 'content_block_delta' && event.delta.text) {
          yield {
            id: currentMessageId,
            content: event.delta.text,
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          };
        }
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private convertToAnthropicMessages(
    messages: Message[]
  ): Array<Anthropic.MessageParam> {
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