# end_voice_session

## Summary

Graceful voice session termination tool. Ends voice connection while keeping text chat available. Voice mode only.

## Preconditions

- Must be in voice mode (`capabilities.voice === true`)
- Voice session must be active
- Should have valid reason for ending (user request, task complete, switch to text)

## Postconditions

**Voice Mode:**
- Final message spoken (if provided)
- Voice session terminated after message delivery
- WebSocket connection remains open for text chat
- Client UI switches from voice mode to text mode

**State Changes:**
- Voice session closed
- Text chat remains available
- Client UI updates to text-only mode

**Intents Returned:**
- `END_VOICE_SESSION` (after: 'current_turn' if final message, 'immediate' otherwise)

## Invariants

- Only works in voice mode (rejected in text mode)
- Tool is idempotent (multiple calls with same reason safe)
- Does NOT close WebSocket connection (only voice session)
- Does NOT block user (unlike ignore_user)
- Session remains active for text communication

## Failure Modes

### Validation Failures
- Invalid reason (not in enum)
- final_message too short (<5 chars) or too long (>200 chars)
- Tool called in text mode

### Execution Failures
- Voice session already closed
- Voice session unavailable
- Final message delivery failed (degrades gracefully)

### Graceful Degradation
- If final message delivery fails, session ends anyway
- If voice session already closed, returns success (idempotent)

## Examples

### Example 1: User Request
```javascript
// User says "end voice mode" or "switch to text"
await toolRegistry.executeTool('end_voice_session', {
  clientId: 'abc123',
  geminiSession: session,
  args: {
    reason: 'user_request',
    final_message: 'Ending voice session. Feel free to continue in text.'
  }
});

// Returns:
{
  ok: true,
  data: {
    reason: 'user_request',
    finalMessageDelivered: true,
    sessionEnded: true
  },
  intents: [
    { type: 'END_VOICE_SESSION', after: 'current_turn' }
  ],
  meta: { ... }
}
```

### Example 2: Task Complete
```javascript
// Conversation naturally concluded
await toolRegistry.executeTool('end_voice_session', {
  clientId: 'abc123',
  geminiSession: session,
  args: {
    reason: 'task_complete',
    final_message: 'Great conversation. Talk soon!'
  }
});
```

### Example 3: Switch to Text (No Message)
```javascript
// Need to show code/diagram in text
await toolRegistry.executeTool('end_voice_session', {
  clientId: 'abc123',
  geminiSession: session,
  args: {
    reason: 'switch_to_text'
    // No final_message - just end silently
  }
});
```

## Common Mistakes

### Mistake 1: Using in text mode
**Problem:** Tool only works in voice mode
**Solution:** Check `capabilities.voice` before calling. Text mode doesn't have voice session to end.

### Mistake 2: Using as punishment
**Problem:** This is graceful termination, not punishment
**Solution:** Use `ignore_user` for punitive timeouts. This tool is for normal endings.

### Mistake 3: Long final messages
**Problem:** Message too long delays session end
**Solution:** Keep final_message under 200 chars (1-2 sentences max)

### Mistake 4: Ending mid-conversation
**Problem:** Abrupt endings confuse users
**Solution:** Only use when conversation naturally concludes or user explicitly requests

### Mistake 5: Expecting WebSocket closure
**Problem:** Assuming tool closes WebSocket connection
**Solution:** Tool only ends voice session. WebSocket stays open for text chat.
