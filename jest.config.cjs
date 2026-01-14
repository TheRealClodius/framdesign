const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Suppress haste map warnings for extension directories
process.env.JEST_IGNORE_PATTERNS = '.cursor|.antigravity|.vscode|.local'

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testEnvironment: 'jest-environment-node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.tsx', '**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'tools/**/*.js',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/_build/**',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/.cursor/',
    '/.antigravity/',
    '/.vscode/',
    '/.local/',
  ],
  modulePathIgnorePatterns: [
    '/.cursor/',
    '/.antigravity/',
    '/.vscode/',
    '/.local/',
  ],
  // Allow importing .js files from tools directory as ES modules
  transformIgnorePatterns: [
    'node_modules/(?!(@google/genai|@lancedb)/)',
  ],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
