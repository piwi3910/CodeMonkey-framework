import { Application } from './app';

async function main() {
  const app = new Application();

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM signal. Starting graceful shutdown...');
    await app.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT signal. Starting graceful shutdown...');
    await app.stop();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  try {
    await app.start();
    console.log('CodeMonkey Framework is ready to assist you! 🐒');
    console.log(`
Features available:
- OpenAI-compatible API endpoint at /v1/chat/completions
- Project management endpoints at /api/projects
- Agent management endpoints at /api/agents
- Multiple agent roles: PM, Architect, Frontend, Backend, etc.
- Persistent context and memory
- Task management and coordination
    `);
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});