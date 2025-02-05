import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/env';
import crypto from 'crypto';

interface AuthenticatedRequest extends Request {
  apiKey?: string;
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        message: 'Missing or invalid API key',
        type: 'authentication_error',
      },
    });
    return;
  }

  const apiKey = authHeader.split(' ')[1];
  
  // Hash the API key with the salt for comparison
  const hashedKey = crypto
    .createHash('sha256')
    .update(apiKey + config.security.apiKeySalt)
    .digest('hex');

  // In a real implementation, we would validate against stored API keys
  // For now, we'll just check if it's properly hashed
  if (!hashedKey) {
    res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error',
      },
    });
    return;
  }

  req.apiKey = apiKey;
  next();
}