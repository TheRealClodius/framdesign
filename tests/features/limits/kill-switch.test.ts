/**
 * Integration Test: Global User Budget & Kill Switch
 * 
 * Verifies that the UsageService correctly blocks requests
 * once the global token budget is exhausted.
 */

import { UsageService } from '../../../lib/services/usage-service';
import { TOKEN_CONFIG } from '../../../lib/constants';

describe('Kill Switch Integration', () => {
  const testUserId = 'test-kill-switch-user';

  beforeEach(async () => {
    // Reset usage for test user (direct file manipulation simulation)
    await UsageService.recordUsage(testUserId, - (await UsageService.getUserUsage(testUserId)).totalTokens);
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
