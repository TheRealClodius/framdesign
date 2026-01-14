# start_voice_session

## Summary
Transitions from text mode to voice mode. Activates microphone and establishes real-time voice conversation with Gemini Live API. Only available in text mode (cannot start voice from within voice session).

## Preconditions
- Must be in text mode (`capabilities.voice === false`)
- Client must support voice capabilities (microphone access)
- WebSocket connection must be active
- Voice server must be operational

## Postconditions

**Success Case:**
- Text mode conversation paused
- Client receives signal to activate voice mode
- Microphone activated
- Voice WebSocket connection established to voice-server
- If pending_request provided, voice agent addresses it immediately

**API Response:**
```json
{
  "message": "Let's switch to voice mode.",
  "startVoiceSession": true,
  "pendingRequest": "optional queued request"
}
```

**Client Actions:**
- UI switches from text chat to voice interface
- Microphone permission requested (if not granted)
- WebSocket connects to voice-server
- Voice session begins

## Invariants
- Only works in text mode (blocked in voice mode)
- Idempotent (safe to call multiple times)
- Does not close text chat connection (can return to text later via end_voice_session)
- pending_request preserved and passed to voice agent

## Failure Modes

### Validation Failures
- Called from voice mode → ErrorType.MODE_RESTRICTED
- pending_request too long (>200 chars)

### Execution Failures
- **Voice server unavailable** → Client-side error (handler returns success, client fails to connect)
- **Microphone permission denied** → Client-side error (not tool error)
- **WebSocket connection failed** → Client-side error (connection to voice-server)

### Graceful Degradation
- If voice server unavailable, client shows error, text chat remains functional
- If handler fails, user can retry or continue in text mode

## Examples

### Example 1: Simple Voice Activation
```javascript
// User: "start voice mode" or "switch to voice"
await toolRegistry.executeTool('start_voice_session', {
  capabilities: { voice: false, messaging: true },
  args: {}
});

// Returns:
{
  ok: true,
  data: {
    voice_session_requested: true,
    pending_request: null,
    message: "Voice session will be activated by client"
  }
}

// API intercepts and returns:
{
  message: "Let's switch to voice mode.",
  startVoiceSession: true,
  pendingRequest: null
}
```

### Example 2: Voice with Pending Request
```javascript
// User: "start voice mode and tell me a joke"
await toolRegistry.executeTool('start_voice_session', {
  capabilities: { voice: false, messaging: true },
  args: {
    pending_request: "tell me a joke"
  }
});

// Voice agent receives "tell me a joke" as first input
```

### Example 3: Blocked in Voice Mode
```javascript
// Already in voice mode
await toolRegistry.executeTool('start_voice_session', {
  capabilities: { voice: true },
  args: {}
});

// Returns:
{
  ok: false,
  error: {
    type: "MODE_RESTRICTED",
    message: "start_voice_session only available in text mode",
    retryable: false
  }
}
```

## Common Mistakes

### Mistake 1: Calling from voice mode
**Problem:** Trying to start voice session when already in voice
**Solution:** Check capabilities.voice before calling. Use end_voice_session to end current session first.

### Mistake 2: Expecting immediate voice response
**Problem:** Assuming tool execution directly activates voice
**Solution:** Tool signals client to activate voice. Client handles microphone/WebSocket setup.

### Mistake 3: Not preserving user intent
**Problem:** User says "start voice and do X", but X gets lost
**Solution:** Always pass additional requests via pending_request parameter.

### Mistake 4: Treating as voice session endpoint
**Problem:** Assuming tool handles voice conversation logic
**Solution:** Tool only initiates transition. Voice agent (voice-server) handles actual conversation.

### Mistake 5: Retrying on MODE_RESTRICTED
**Problem:** Repeatedly calling when in voice mode
**Solution:** MODE_RESTRICTED is permanent (not retryable). Check mode before calling.
