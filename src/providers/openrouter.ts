import { Message, ChatOptions, ChatResponse, ProviderConfig } from '../types';
import { LLMProvider } from './base';

export interface OpenRouterConfig extends ProviderConfig {
  modelName: string;
  apiKey: string;
}

interface OpenRouterMessage {
  role: string;
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments?: string;
  };
}

interface OpenRouterChoice {
  message: OpenRouterMessage;
  finish_reason: string;
  index: number;
}

interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenRouterChoice[];
  usage: OpenRouterUsage;
}

interface OpenRouterStreamChoice {
  delta: Partial<OpenRouterMessage>;
  finish_reason: string | null;
  index: number;
}

interface OpenRouterStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenRouterStreamChoice[];
}

export class OpenRouterProvider extends LLMProvider {
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(config: OpenRouterConfig) {
    super(config);
    this.validateConfig();
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    this.validateMessages(messages);
    this.validateOptions(options);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://github.com/yourusername/codemonkey-framework',
        },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: this.convertMessages(messages),
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          stop: options?.stopSequences,
          functions: options?.functions,
          function_call: options?.functionCall,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const result = await response.json() as OpenRouterResponse;
      const choice = result.choices[0];

      if (!choice || !choice.message) {
        throw new Error('No response from OpenRouter');
      }

      return {
        id: result.id,
        content: choice.message.content || '',
        usage: {
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://github.com/yourusername/codemonkey-framework',
        },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: this.convertMessages(messages),
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
          stop: options?.stopSequences,
          functions: options?.functions,
          function_call: options?.functionCall,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let id = '';
      let content = '';
      let functionCallName = '';
      let functionCallArgs = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(Boolean);

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6)) as OpenRouterStreamResponse;
              if (!id) id = data.id;

              const delta = data.choices[0]?.delta;
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
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  protected validateConfig(): void {
    super.validateConfig();
    if (!this.config.apiKey) {
      throw new Error('OpenRouter API key is required');
    }
  }

  private convertMessages(messages: Message[]): OpenRouterMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      name: msg.name,
      function_call: msg.function_call,
    }));
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`OpenRouter API error: ${error.message}`);
    }
    return new Error('Unknown error occurred');
  }
}