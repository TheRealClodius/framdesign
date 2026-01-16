// Jest setup file
// This file runs before each test file

// Load env vars for integration tests (local dev)
// This allows tests to use real API keys from .env/.env.local without requiring
// the caller to manually export them in the shell.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}
