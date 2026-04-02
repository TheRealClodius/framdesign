// Jest setup file
// This file runs before each test file

// Load env vars for integration tests (local dev)
// This allows tests to use real API keys from .env without requiring
// the caller to manually export them in the shell.
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';

dotenv.config({ path: '.env' });

// Usage tests must use local `.usage/` files, not GCS (dotenv may set bucket + credentials).
process.env.USAGE_STORAGE = 'file';

// Parallel Jest workers must not share the same usage JSON file.
const worker = process.env.JEST_WORKER_ID ?? '0';
process.env.FRAM_USAGE_DIR = path.join(os.tmpdir(), `fram-usage-jest-w${worker}`);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}
