import { ChatOptions, ChatResponse, Message, ProviderConfig } from '../types';
import { LLMProvider } from './base';

export interface OllamaConfig extends ProviderConfig {
  modelName: string; // e.g., 'llama2', 'codellama', 'mistral'
  baseUrl?: string; // Optional, defaults to http://localhost:11434
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
}

export class OllamaProvider extends LLMProvider {
  private baseUrl: string;

  constructor(config: OllamaConfig) {
    super(config);
    this.validateConfig();
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    this.validateMessages(messages);
    this.validateOptions(options);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: this.convertToOllamaMessages(messages),
          stream: false,
          options: {
            temperature: options?.temperature,
            num_predict: options?.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const result = (await response.json()) as OllamaResponse;

      return {
        id: `ollama-${Date.now()}`,
        content: result.response,
        usage: {
          promptTokens: 0, // Ollama doesn't provide token counts
          completionTokens: 0,
          totalTokens: 0,
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
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: this.convertToOllamaMessages(messages),
          stream: true,
          options: {
            temperature: options?.temperature,
            num_predict: options?.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let id = `ollama-${Date.now()}`;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(Boolean);

          for (const line of lines) {
            const result = JSON.parse(line) as OllamaResponse;
            if (result.response) {
              yield {
                id,
                content: result.response,
                usage: {
                  promptTokens: 0,
                  completionTokens: 0,
                  totalTokens: 0,
                },
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

  private convertToOllamaMessages(messages: Message[]): Array<{
    role: string;
    content: string;
  }> {
    return messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }));
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`Ollama API error: ${error.message}`);
    }
    return new Error('Unknown error occurred');
  }
}