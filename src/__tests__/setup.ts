import { config } from '../config/env';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL = 'file:./test.db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.CHROMADB_HOST = 'localhost';
process.env.CHROMADB_PORT = '8000';
process.env.API_KEY_SALT = 'test-salt';
process.env.JWT_SECRET = 'test-secret';
process.env.CORS_ORIGINS = '*';
process.env.DEFAULT_PROVIDER = 'claude';
process.env.DEFAULT_MODEL = 'claude-3-opus-20240229';

// Global test setup
beforeAll(() => {
  // Add any global setup here
});

// Global test teardown
afterAll(() => {
  // Add any global teardown here
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Add custom matchers if needed
expect.extend({
  // Add custom matchers here
});