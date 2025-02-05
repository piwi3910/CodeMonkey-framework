import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/env';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(401).json({ 
      error: 'API key is required',
      message: 'Please provide a valid API key in the x-api-key header',
    });
  }

  // In a real application, you would validate the API key against a database
  // For now, we'll just check if it matches the configured key
  if (apiKey !== config.security.apiKeySalt) {
    return res.status(401).json({ 
      error: 'Invalid API key',
      message: 'The provided API key is not valid',
    });
  }

  // Add the validated API key to the request for downstream use
  req.headers['validated-api-key'] = apiKey;

  next();
};