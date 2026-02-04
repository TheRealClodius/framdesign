/**
 * Guard helpers for Gemini Live SDK availability.
 * Provides clear errors when SDK API surface changes.
 */

export function assertLiveApiAvailable(ai) {
  if (!ai?.live || typeof ai.live.connect !== 'function') {
    throw new Error(
      'Gemini Live API is not available in this SDK. Expected ai.live.connect(). ' +
        'Check @google/genai version and Live API support.'
    );
  }
}

export function assertLiveSession(session) {
  if (!session || typeof session.sendToolResponse !== 'function') {
    throw new Error(
      'Gemini Live session is missing sendToolResponse(). ' +
        'Check SDK method names/events and update live transport integration.'
    );
  }
}
