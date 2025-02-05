import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ValidationError } from '../middleware/error';
import { ClaudeProvider, ClaudeConfig } from '../../providers/claude';
import { config } from '../../config/env';

const router = Router();

// Validation schemas
const functionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.any()),
});

const functionCallSchema = z.union([
  z.literal('auto'),
  z.literal('none'),
  z.object({ name: z.string() }),
]);

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'function']),
  content: z.string(),
  name: z.string().optional(),
  function_call: z.object({ name: z.string() }).optional(),
});

const chatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(messageSchema),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  stream: z.boolean().optional(),
  functions: z.array(functionSchema).optional(),
  function_call: functionCallSchema.optional(),
});

// Provider configuration
const providerConfigs: Record<string, ClaudeConfig> = {
  'claude-3-opus-20240229': {
    apiKey: config.llm.claude.apiKey!,
    modelName: 'claude-3-opus-20240229',
  },
  'claude-3-sonnet-20240229': {
    apiKey: config.llm.claude.apiKey!,
    modelName: 'claude-3-sonnet-20240229',
  },
  'claude-3-haiku-20240229': {
    apiKey: config.llm.claude.apiKey!,
    modelName: 'claude-3-haiku-20240229',
  },
};

interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content: string;
    };
    finish_reason: string | null;
  }>;
}

// Chat completion endpoint
router.post('/chat/completions', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validatedData = chatCompletionRequestSchema.parse(req.body);
    
    // Get the appropriate provider config
    const providerConfig = providerConfigs[validatedData.model];
    if (!providerConfig) {
      throw new ValidationError('Unsupported model', 'model');
    }

    // Initialize provider
    const provider = new ClaudeProvider(providerConfig);

    // Handle streaming response
    if (validatedData.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const stream = provider.stream(validatedData.messages, {
        temperature: validatedData.temperature,
        maxTokens: validatedData.max_tokens,
        functions: validatedData.functions,
        functionCall: validatedData.function_call as "auto" | "none" | { name: string } | undefined,
      });

      try {
        for await (const chunk of stream) {
          const streamChunk: StreamChunk = {
            id: chunk.id || `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: validatedData.model,
            choices: [
              {
                index: 0,
                delta: {
                  content: chunk.content || '',
                },
                finish_reason: null,
              },
            ],
          };

          res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
      } catch (error) {
        console.error('Streaming error:', error);
        res.write(`data: ${JSON.stringify({ error: 'Streaming error occurred' })}\n\n`);
      } finally {
        res.end();
      }
      return;
    }

    // Handle regular response
    const response = await provider.chat(validatedData.messages, {
      temperature: validatedData.temperature,
      maxTokens: validatedData.max_tokens,
      functions: validatedData.functions,
      functionCall: validatedData.function_call as "auto" | "none" | { name: string } | undefined,
    });

    res.json({
      id: response.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now(),
      model: validatedData.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: response.usage,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Invalid request format',
        error.errors[0].path.join('.')
      );
    }
    throw error;
  }
});

export const chatRouter = router;