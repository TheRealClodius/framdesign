# start_voice_session

Transitions from text chat to voice mode. Activates microphone for real-time conversation. Text mode only. Supports queued requests for immediate voice handling.

## Parameters

- **pending_request** (optional): Request to handle immediately after voice activates (max 200 chars)
  - Useful when user says "start voice and tell me X"
  - Voice agent receives this as first input

## Examples

**Simple voice activation:**
```json
{}
```
Switches to voice mode, no queued request.

**Voice with pending request:**
```json
{
  "pending_request": "tell me a joke"
}
```
Activates voice mode, voice agent immediately addresses "tell me a joke".

**Voice with complex request:**
```json
{
  "pending_request": "search for people who worked on AI projects"
}
```
Voice agent receives full context and can use tools immediately.

## Watch Out

- **Text mode only**: Cannot start voice from within voice mode. Returns `MODE_RESTRICTED` error if called in voice.
- **Client handles activation**: Tool signals client to activate voice. Client handles microphone permissions and WebSocket setup.
- **Use pending_request wisely**: Don't lose user intent. If user says "start voice and do X", pass X via this parameter.
- **Is idempotent**: Safe to call multiple times (useful for retry logic).
- **Not the voice agent**: Tool only initiates transition. Voice server (voice-server) handles actual conversation.
- **Graceful degradation**: If voice server unavailable, client shows error but text chat remains functional.
