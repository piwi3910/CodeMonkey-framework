import OpenAI from 'openai';
import { ChatOptions, ChatResponse, Message, ProviderConfig } from '../types';
import { LLMProvider } from './base';

export interface OpenAIConfig extends ProviderConfig {
  modelName: string; // e.g., 'gpt-4', 'gpt-3.5-turbo'
}

type OpenAIRole = 'system' | 'user' | 'assistant' | 'function';

export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;

  constructor(config: OpenAIConfig) {
    super(config);
    this.validateConfig();
    this.client = new OpenAI({
      apiKey: config.apiKey!,
    });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    this.validateMessages(messages);
    this.validateOptions(options);

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.modelName,
        messages: this.convertToOpenAIMessages(messages),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        functions: options?.functions,
        function_call: options?.functionCall,
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
        messages: this.convertToOpenAIMessages(messages),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        functions: options?.functions,
        function_call: options?.functionCall,
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

  private convertToOpenAIMessages(
    messages: Message[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.Chat.ChatCompletionMessageParam => {
      const role = this.convertRole(msg.role);

      switch (role) {
        case 'function':
          return {
            role,
            content: msg.content,
            name: msg.name || 'unknown_function',
          };
        case 'assistant':
          if (msg.functionCall) {
            return {
              role,
              content: msg.content,
              function_call: {
                name: msg.functionCall.name,
                arguments: JSON.stringify(msg.functionCall.arguments),
              },
            };
          }
          return {
            role,
            content: msg.content,
          };
        case 'system':
        case 'user':
          return {
            role,
            content: msg.content,
          };
        default:
          return {
            role: 'user',
            content: msg.content,
          };
      }
    });
  }

  private convertRole(role: string): OpenAIRole {
    switch (role) {
      case 'system':
      case 'user':
      case 'assistant':
      case 'function':
        return role as OpenAIRole;
      default:
        return 'user'; // Default to user for unknown roles
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof OpenAI.APIError) {
      return new Error(`OpenAI API error: ${error.message}`);
    }
    if (error instanceof Error) {
      return error;
    }
    return new Error('Unknown error occurred');
  }
}