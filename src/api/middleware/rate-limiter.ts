import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { config } from '../../config/env';

const redis = new Redis(config.redis.url);

// Rate limit settings
const WINDOW_SIZE_IN_SECONDS = 60; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute

interface RateLimitInfo {
  remaining: number;
  reset: number;
  total: number;
}

export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers.authorization?.split(' ')[1];
  
  if (!apiKey) {
    next();
    return;
  }

  const key = `ratelimit:${apiKey}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % WINDOW_SIZE_IN_SECONDS);

  try {
    // Get the current request count
    const requestCount = await redis.get(key);
    const currentCount = requestCount ? parseInt(requestCount, 10) : 0;

    if (currentCount >= MAX_REQUESTS_PER_WINDOW) {
      const resetTime = windowStart + WINDOW_SIZE_IN_SECONDS;
      const rateLimitInfo: RateLimitInfo = {
        remaining: 0,
        reset: resetTime,
        total: MAX_REQUESTS_PER_WINDOW,
      };

      res.set({
        'RateLimit-Limit': MAX_REQUESTS_PER_WINDOW,
        'RateLimit-Remaining': 0,
        'RateLimit-Reset': resetTime,
      });

      res.status(429).json({
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
          param: null,
          code: 'rate_limit_exceeded',
        },
        rate_limit: rateLimitInfo,
      });
      return;
    }

    // Increment the counter
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, WINDOW_SIZE_IN_SECONDS);
    await pipeline.exec();

    // Set rate limit headers
    const remaining = MAX_REQUESTS_PER_WINDOW - (currentCount + 1);
    const resetTime = windowStart + WINDOW_SIZE_IN_SECONDS;

    res.set({
      'RateLimit-Limit': MAX_REQUESTS_PER_WINDOW,
      'RateLimit-Remaining': Math.max(0, remaining),
      'RateLimit-Reset': resetTime,
    });

    next();
  } catch (error) {
    console.error('Rate limiter error:', error);
    // On redis error, allow the request but log the error
    next();
  }
}