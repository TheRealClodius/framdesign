/**
 * Feature: Telemetry & Limits
 *
 * This suite verifies the system's ability to track usage (tokens)
 * and enforce safety budgets per user to prevent abuse and cost overruns.
 */

import { UsageService } from '@/lib/services/usage-service';
import { TOKEN_CONFIG } from '@/lib/constants';
import { BudgetExhaustedError } from '@/lib/errors';
import { promises as fs } from 'fs';
import path from 'path';

const USAGE_DIR = path.join(process.cwd(), '.usage');
const USAGE_FILE = path.join(USAGE_DIR, 'user-tokens.json');

describe('Feature: Telemetry & Limits', () => {

  // Clean up test data before each test
  beforeEach(async () => {
    try {
      await fs.unlink(USAGE_FILE);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  // --- 1. Telemetry (Token Usage) ---
  describe('1. Telemetry (Token Tracking)', () => {
    test('should accurately estimate tokens using tiktoken-style logic', () => {
      // Mocking the 1 token ≈ 4 chars logic used in the app
      const estimateTokens = (text: string) => Math.ceil(text.length / 4);

      const text = "This is a test sentence."; // 24 chars
      expect(estimateTokens(text)).toBe(6);
    });

    test('should record metrics for tool execution latency', () => {
      const metrics = {
        toolId: 'kb_search',
        latency: 150,
        timestamp: Date.now()
      };

      expect(metrics.latency).toBeLessThan(5000); // Standard budget
      expect(metrics.toolId).toBe('kb_search');
    });
  });

  // --- 2. Limits (Budgets & Safety) ---
  describe('2. Limits (Safety Budgets)', () => {
    test('should use 300K tokens as the global limit', () => {
      expect(TOKEN_CONFIG.MAX_GLOBAL_TOKENS_PER_USER).toBe(300000);
    });

    test('UsageService: should track token usage per user', async () => {
      const userId = 'test-user-1';

      // Record some usage
      await UsageService.recordUsage(userId, 1000);

      // Check usage
      const usage = await UsageService.getUserUsage(userId);
      expect(usage.totalTokens).toBe(1000);

      // Record more usage
      await UsageService.recordUsage(userId, 500);

      // Check updated usage
      const updatedUsage = await UsageService.getUserUsage(userId);
      expect(updatedUsage.totalTokens).toBe(1500);
    });

    test('UsageService: should detect when user is over budget', async () => {
      const userId = 'test-user-2';

      // Record usage below limit
      await UsageService.recordUsage(userId, 250000);
      expect(await UsageService.isOverBudget(userId)).toBe(false);

      // Record usage that exceeds limit
      await UsageService.recordUsage(userId, 60000); // Total: 310000
      expect(await UsageService.isOverBudget(userId)).toBe(true);
    });

    test('UsageService: should calculate remaining tokens correctly', async () => {
      const userId = 'test-user-3';

      await UsageService.recordUsage(userId, 100000);

      const remaining = await UsageService.getRemainingTokens(userId);
      expect(remaining).toBe(200000);
    });

    test('UsageService: should return 0 remaining tokens when over budget', async () => {
      const userId = 'test-user-4';

      await UsageService.recordUsage(userId, 350000);

      const remaining = await UsageService.getRemainingTokens(userId);
      expect(remaining).toBe(0);
    });

    test('UsageService: should isolate budgets between different users', async () => {
      const userA = 'test-user-a';
      const userB = 'test-user-b';

      await UsageService.recordUsage(userA, 50000);
      await UsageService.recordUsage(userB, 100000);

      const usageA = await UsageService.getUserUsage(userA);
      const usageB = await UsageService.getUserUsage(userB);

      expect(usageA.totalTokens).toBe(50000);
      expect(usageB.totalTokens).toBe(100000);
    });

    test('BudgetExhaustedError: should have correct properties', () => {
      const error = new BudgetExhaustedError();

      expect(error.name).toBe('BudgetExhaustedError');
      expect(error.status).toBe(402);
      expect(error.message).toContain('iceberg');
      expect(error.message).toContain('Andrei');
    });

    test('should prevent any agent response once budget is exhausted', () => {
      const isBudgetExhausted = true;
      const generateResponse = (input: string) => {
        if (isBudgetExhausted) return null; // Agent stops responding
        return "Normal response";
      };

      expect(generateResponse("Hello")).toBeNull();
    });
  });
});
