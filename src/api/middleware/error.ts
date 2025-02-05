import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  type?: string;
  param?: string;
  code?: string;
  statusCode?: number;
}

export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('API Error:', err);

  const statusCode = err.statusCode || 500;
  const errorResponse = {
    error: {
      message: err.message || 'An unexpected error occurred',
      type: err.type || 'api_error',
      param: err.param || null,
      code: err.code || 'internal_error',
    },
  };

  // Handle specific error types
  switch (err.type) {
    case 'authentication_error':
      errorResponse.error.code = 'invalid_api_key';
      break;
    case 'validation_error':
      errorResponse.error.code = 'invalid_request_error';
      break;
    case 'rate_limit_error':
      errorResponse.error.code = 'rate_limit_exceeded';
      break;
    case 'not_found_error':
      errorResponse.error.code = 'resource_not_found';
      break;
  }

  // Add request ID for tracking
  const requestId = req.headers['x-request-id'] || 
    Math.random().toString(36).substring(7);
  
  res.set('X-Request-ID', requestId.toString());

  res.status(statusCode).json(errorResponse);
}

export class ValidationError extends Error implements ApiError {
  type = 'validation_error';
  statusCode = 400;
  constructor(message: string, public param?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error implements ApiError {
  type = 'authentication_error';
  statusCode = 401;
  constructor(message: string = 'Invalid API key') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends Error implements ApiError {
  type = 'rate_limit_error';
  statusCode = 429;
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends Error implements ApiError {
  type = 'not_found_error';
  statusCode = 404;
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}