import OpenAI from 'openai';
import { Message, ChatOptions, ChatResponse, ProviderConfig } from '../types';
import { LLMProvider } from './base';

export interface OpenAIConfig extends ProviderConfig {
  modelName: string;
  apiKey: string;
}

export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;

  constructor(config: OpenAIConfig) {
    super(config);
    this.validateConfig();
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    this.validateMessages(messages);
    this.validateOptions(options);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.modelName,
        messages: this.convertMessages(messages),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        stop: options?.stopSequences,
        functions: options?.functions,
        function_call: options?.functionCall,
      });

      const choice = completion.choices[0];
      if (!choice || !choice.message) {
        throw new Error('No response from OpenAI');
      }

      return {
        id: completion.id,
        content: choice.message.content || '',
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
        functionCall: choice.message.function_call ? {
          name: choice.message.function_call.name,
          arguments: choice.message.function_call.arguments || '',
        } : undefined,
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
        messages: this.convertMessages(messages),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        stop: options?.stopSequences,
        functions: options?.functions,
        function_call: options?.functionCall,
        stream: true,
      });

      let id = '';
      let content = '';
      let functionCallName = '';
      let functionCallArgs = '';

      for await (const chunk of stream) {
        id = chunk.id;
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          content += delta.content;
        }

        if (delta?.function_call) {
          if (delta.function_call.name) {
            functionCallName = delta.function_call.name;
          }
          if (delta.function_call.arguments) {
            functionCallArgs += delta.function_call.arguments;
          }
        }

        yield {
          id,
          content,
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          functionCall: functionCallName
            ? {
                name: functionCallName,
                arguments: functionCallArgs,
              }
            : undefined,
        };
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private convertMessages(messages: Message[]): any[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      name: msg.name,
      function_call: msg.function_call,
    }));
  }

  private validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    if (!this.config.modelName) {
      throw new Error('OpenAI model name is required');
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`OpenAI API error: ${error.message}`);
    }
    return new Error('Unknown error occurred');
  }
}