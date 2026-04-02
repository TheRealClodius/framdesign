import { describe, test, expect } from '@jest/globals';
import {
  isValidClientUserId,
  resolveBudgetKeyFromParts,
  getClientIpFromHeaders,
} from '@/lib/utils/budget-key';

describe('budget-key', () => {
  test('isValidClientUserId accepts browser ids', () => {
    expect(isValidClientUserId('user-abc123xyz-xyz12')).toBe(true);
  });

  test('isValidClientUserId rejects spoof strings', () => {
    expect(isValidClientUserId('attacker')).toBe(false);
    expect(isValidClientUserId('user-extra-part-here')).toBe(false);
  });

  test('resolveBudgetKeyFromParts uses client id when valid', () => {
    const id = 'user-abc123xyz-xyz12';
    expect(resolveBudgetKeyFromParts(id, '1.2.3.4')).toBe(id);
  });

  test('resolveBudgetKeyFromParts hashes IP when userId invalid', () => {
    const a = resolveBudgetKeyFromParts('evil', '1.2.3.4');
    const b = resolveBudgetKeyFromParts('evil', '1.2.3.4');
    expect(a).toMatch(/^ip:[a-f0-9]{32}$/);
    expect(a).toBe(b);
    const c = resolveBudgetKeyFromParts('evil', '5.6.7.8');
    expect(a).not.toBe(c);
  });

  test('getClientIpFromHeaders prefers x-forwarded-for', () => {
    const h = new Headers();
    h.set('x-forwarded-for', '203.0.113.1, 10.0.0.1');
    expect(getClientIpFromHeaders(h)).toBe('203.0.113.1');
  });
});
