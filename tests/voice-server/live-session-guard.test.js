import { describe, test, expect } from '@jest/globals';
import { assertLiveApiAvailable, assertLiveSession } from '../../voice-server/live-session-guard.js';

describe('live-session-guard', () => {
  test('throws when ai.live.connect is missing', () => {
    expect(() => assertLiveApiAvailable({})).toThrow(/live api|connect/i);
  });

  test('throws when session.sendToolResponse is missing', () => {
    expect(() => assertLiveSession({})).toThrow(/sendToolResponse/i);
  });
});
