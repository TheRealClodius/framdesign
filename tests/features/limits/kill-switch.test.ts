/**
 * Integration Test: Global User Budget & Kill Switch
 * 
 * Verifies that the UsageService correctly blocks requests
 * once the global token budget is exhausted.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { UsageService } from '../../../lib/services/usage-service';
import { TOKEN_CONFIG } from '../../../lib/constants';

const USAGE_DIR = process.env.FRAM_USAGE_DIR
  ? path.resolve(process.env.FRAM_USAGE_DIR)
  : path.join(process.cwd(), '.usage');
const USAGE_FILE = path.join(USAGE_DIR, 'user-tokens.json');

describe('Kill Switch Integration', () => {
  const testUserId = 'test-kill-switch-user';

  beforeEach(async () => {
    try {
      await fs.unlink(USAGE_FILE);
    } catch {
      // no file
    }
  });

  test('should allow requests when under budget', async () => {
    const isOver = await UsageService.isOverBudget(testUserId);
    expect(isOver).toBe(false);
  });

  test('should block requests when budget is hit', async () => {
    // Force user over budget
    await UsageService.recordUsage(testUserId, TOKEN_CONFIG.MAX_GLOBAL_TOKENS_PER_USER + 1);
    
    const isOver = await UsageService.isOverBudget(testUserId);
    expect(isOver).toBe(true);
  });

  test('should accurately track cumulative usage across sessions', async () => {
    await UsageService.recordUsage(testUserId, 100);
    await UsageService.recordUsage(testUserId, 200);
    
    const usage = await UsageService.getUserUsage(testUserId);
    expect(usage.totalTokens).toBe(300);
  });
});
