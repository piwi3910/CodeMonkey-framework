import OpenAI from 'openai';
import { ChatOptions, ChatResponse, Message, ProviderConfig } from '../types';
import { LLMProvider } from './base';

export interface OpenRouterConfig extends ProviderConfig {
  modelName: string; // e.g., 'anthropic/claude-2', 'meta-llama/llama-2-70b-chat'
}

type OpenRouterRole = 'system' | 'user' | 'assistant' | 'function';

export class OpenRouterProvider extends LLMProvider {
  private client: OpenAI;

  constructor(config: OpenRouterConfig) {
    super(config);
    this.validateConfig();
    this.client = new OpenAI({
      apiKey: config.apiKey!,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/yourusername/codemonkey-framework',
        'X-Title': 'CodeMonkey Framework',
      },
    });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    this.validateMessages(messages);
    this.validateOptions(options);

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.modelName,
        messages: this.convertToOpenRouterMessages(messages),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        stream: false,
      });

      return {
        id: response.id,
        content: response.choices[0].message.content || '',
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
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

    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.modelName,
        messages: this.convertToOpenRouterMessages(messages),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          yield {
            id: chunk.id,
            content: chunk.choices[0].delta.content,
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

  private convertToOpenRouterMessages(
    messages: Message[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.Chat.ChatCompletionMessageParam => {
      const role = this.convertRole(msg.role);

      // OpenRouter doesn't support function calling, so we convert function messages
      // to regular messages with appropriate formatting
      if (role === 'function') {
        return {
          role: 'assistant',
          content: `Function Response (${msg.name}): ${msg.content}`,
        };
      }

      if (role === 'assistant' && msg.functionCall) {
        return {
          role,
          content: `Function Call: ${msg.functionCall.name}(${JSON.stringify(msg.functionCall.arguments)})`,
        };
      }

      return {
        role,
        content: msg.content,
      };
    });
  }

  private convertRole(role: string): OpenRouterRole {
    switch (role) {
      case 'system':
      case 'user':
      case 'assistant':
      case 'function':
        return role as OpenRouterRole;
      default:
        return 'user'; // Default to user for unknown roles
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof OpenAI.APIError) {
      return new Error(`OpenRouter API error: ${error.message}`);
    }
    if (error instanceof Error) {
      return error;
    }
    return new Error('Unknown error occurred');
  }
}