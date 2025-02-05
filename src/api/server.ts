import express from 'express';
import cors from 'cors';
import { config } from '../config/env';
import { setupRoutes } from './routes/chat';
import { errorHandler } from './middleware/error';
import { rateLimiter } from './middleware/rate-limiter';
import { authMiddleware } from './middleware/auth';

export async function createServer() {
  const app = express();

  // Configure middleware
  app.use(cors({
    origin: config.server.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  }));

  app.use(express.json());
  app.use(rateLimiter);
  app.use(authMiddleware);

  // Setup routes
  setupRoutes(app);

  // Error handling
  app.use(errorHandler);

  return app;
}

export async function startServer() {
  try {
    const app = await createServer();
    const port = config.server.port;

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received. Closing server...');
  try {
    await closeServer();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received. Closing server...');
  try {
    await closeServer();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

async function closeServer() {
  // Close database connections
  const { sequelize } = await import('../config/database');
  await sequelize.close();
  console.log('Database connections closed.');
}