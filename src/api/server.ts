import express from 'express';
import cors from 'cors';
import { config } from '../config/env';
import { chatRouter } from './routes/chat';
import { errorHandler } from './middleware/error';
import { rateLimiter } from './middleware/rate-limiter';
import { authenticate } from './middleware/auth';

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: config.server.corsOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
app.use(rateLimiter);

// Authentication
app.use(authenticate);

// Routes
app.use('/v1', chatRouter);

// Error handling
app.use(errorHandler);

export { app };