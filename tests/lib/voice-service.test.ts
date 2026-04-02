import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VoiceService } from '@/lib/services/voice-service';

class MockAudioContext {
  state: AudioContextState = 'running';
  sampleRate = 48000;
  destination = {};
  currentTime = 0;

  createMediaStreamSource() {
    return { connect: jest.fn() };
  }

  createScriptProcessor() {
    return {
      connect: jest.fn(),
      disconnect: jest.fn(),
      onaudioprocess: null
    };
  }

  resume = jest.fn(async () => undefined);
  close = jest.fn(async () => undefined);
}

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  sentMessages: string[] = [];
  onopen: (() => void | Promise<void>) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    mockSockets.push(this);
  }

  send(payload: string) {
    this.sentMessages.push(payload);
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  async emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    await this.onopen?.();
  }

  emitMessage(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  emitClose(code = 1006, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

const mockSockets: MockWebSocket[] = [];

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('VoiceService startup handshake', () => {
  const originalWebSocket = global.WebSocket;
  const originalAudioContext = global.AudioContext;
  const originalNavigator = global.navigator;

  beforeEach(() => {
    jest.useFakeTimers();
    mockSockets.length = 0;

    Object.defineProperty(global, 'WebSocket', {
      configurable: true,
      writable: true,
      value: MockWebSocket
    });

    Object.defineProperty(global, 'AudioContext', {
      configurable: true,
      writable: true,
      value: MockAudioContext
    });

    Object.defineProperty(global, 'navigator', {
      configurable: true,
      writable: true,
      value: {
        mediaDevices: {
          getUserMedia: jest.fn(async () => ({
            getTracks: () => [{ stop: jest.fn() }],
            getAudioTracks: () => [{ enabled: true, muted: false, readyState: 'live', label: 'Mock Mic' }]
          }))
        }
      }
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    Object.defineProperty(global, 'WebSocket', {
      configurable: true,
      writable: true,
      value: originalWebSocket
    });

    Object.defineProperty(global, 'AudioContext', {
      configurable: true,
      writable: true,
      value: originalAudioContext
    });

    Object.defineProperty(global, 'navigator', {
      configurable: true,
      writable: true,
      value: originalNavigator
    });
  });

  test('does not mark the session active until started arrives', async () => {
    const voiceService = new VoiceService();
    const startPromise = voiceService.start([]);
    await flushMicrotasks();

    expect(mockSockets).toHaveLength(1);
    const socket = mockSockets[0];

    await socket.emitOpen();
    expect(voiceService.isSessionActive()).toBe(false);

    const sentTypes = socket.sentMessages.map((payload) => JSON.parse(payload).type);
    expect(sentTypes).toContain('start');
    expect(sentTypes).not.toContain('audio');

    socket.emitMessage({ type: 'started', sessionId: 'session-1' });
    await expect(startPromise).resolves.toBeUndefined();
    expect(voiceService.isSessionActive()).toBe(true);
  });

  test('rejects startup cleanly when the socket closes before started', async () => {
    const voiceService = new VoiceService();
    const startPromise = voiceService.start([]);
    await flushMicrotasks();

    const socket = mockSockets[0];
    await socket.emitOpen();
    socket.emitClose(1011, 'startup failed');

    await expect(startPromise).rejects.toThrow('startup failed');
    expect(voiceService.isSessionActive()).toBe(false);
    expect(voiceService.isReconnecting()).toBe(false);
  });

  test('times out startup instead of hanging indefinitely', async () => {
    const voiceService = new VoiceService();
    const errorHandler = jest.fn();
    voiceService.addEventListener('error', errorHandler as EventListener);

    const startPromise = voiceService.start([]);
    await flushMicrotasks();
    const socket = mockSockets[0];
    await socket.emitOpen();

    jest.advanceTimersByTime(15000);

    await expect(startPromise).rejects.toThrow('Voice session timed out while starting. Please try again.');
    expect(errorHandler).toHaveBeenCalled();
    expect(voiceService.isSessionActive()).toBe(false);
  });
});
