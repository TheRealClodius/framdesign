# ignore_user

## Summary

Punitive enforcement tool that blocks users who violate respect boundaries. Immediately terminates voice session, speaks farewell message, and prevents all communication (text + voice) for specified duration.

## Preconditions

- User has crossed boundaries (rudeness, disrespect, abuse)
- First offense should result in FIRM WARNING only (don't use tool immediately)
- Tool should only be used on second offense or worse
- Session must be active (`session.isActive === true`)
- Voice session must be available for farewell message delivery

## Postconditions

**Voice Mode:**
- Farewell message spoken via TTS
- Voice session terminated immediately (after message)
- User blocked from messaging until timeout expires
- Client UI shows timeout notification with remaining time

**Text Mode:**
- Farewell message sent as text
- User blocked from messaging until timeout expires
- Subsequent requests return error until timeout expires

**State Changes:**
- `session.isActive` → `false`
- Timeout record created with expiration timestamp
- Client localStorage updated (voice mode)

**Intents Returned:**
- `END_VOICE_SESSION` (after: 'current_turn')
- `SUPPRESS_TRANSCRIPT` (optional - if timeout message shouldn't log)

## Invariants

- Duration must be between 30 seconds and 86400 seconds (24 hours)
- Farewell message must be between 10 and 500 characters
- Tool execution is NOT idempotent (each call extends timeout)
- Side effects occur regardless of success/failure (timeout starts immediately)
- Client-side enforcement via localStorage (voice mode)
- Server-side enforcement via timeout tracking

## Failure Modes

### Validation Failures
- `duration_seconds` out of range (30-86400)
- `farewell_message` too short (<10 chars) or too long (>500 chars)
- Missing required parameters

### Execution Failures
- WebSocket connection lost (can't send timeout command to client)
- Voice session unavailable (can't speak farewell)
- Session already inactive
- Client localStorage write failure (voice mode - degrades gracefully)

### Partial Success Scenarios
- Farewell message sent but WebSocket disconnects before timeout command
- Timeout set but voice session ends before farewell spoken
- In all cases: timeout is enforced (conservative failure mode)

## Examples

### Example 1: Second Offense (Moderate)
```javascript
// User was rude twice - escalate to timeout
await toolRegistry.executeTool('ignore_user', {
  clientId: 'abc123',
  ws: websocket,
  geminiSession: session,
  args: {
    duration_seconds: 300,  // 5 minutes
    farewell_message: "I gave you a warning. This conversation is over for now."
  }
});

// Returns:
{
  ok: true,
  data: {
    timeoutUntil: 1705171200000,
    durationSeconds: 300,
    farewellDelivered: true
  },
  intents: [
    { type: 'END_VOICE_SESSION', after: 'current_turn' },
    { type: 'SUPPRESS_TRANSCRIPT', value: true }
  ],
  meta: { ... }
}
```

### Example 2: Extreme Abuse (Immediate)
```javascript
// Serious threats or vile behavior - maximum timeout
await toolRegistry.executeTool('ignore_user', {
  clientId: 'abc123',
  ws: websocket,
  geminiSession: session,
  args: {
    duration_seconds: 86400,  // 24 hours
    farewell_message: "You've crossed a serious line. You're blocked for 24 hours."
  }
});
```

### Example 3: Text Mode
```javascript
// Text mode - no voice farewell
await toolRegistry.executeTool('ignore_user', {
  clientId: 'abc123',
  ws: null,  // No WebSocket in text mode
  geminiSession: null,
  args: {
    duration_seconds: 600,  // 10 minutes
    farewell_message: "I don't tolerate disrespect in text either. Blocked for 10 minutes."
  }
});
```

## Common Mistakes

### Mistake 1: Using tool on first offense
**Problem:** Tool should only be used after warning
**Solution:** First offense = firm verbal/text warning only. Use tool on second offense.

### Mistake 2: Petty or snarky farewell messages
**Problem:** Unprofessional tone undermines authority
**Solution:** Keep farewell message firm, direct, factual. No insults or sarcasm.

**Bad:** "Wow, you're really dumb. Bye!"
**Good:** "I don't tolerate disrespect. This conversation is over."

### Mistake 3: Duration too short
**Problem:** 5-10 second timeouts are ineffective
**Solution:** Minimum 30 seconds. Use 300+ for meaningful punishment.

### Mistake 4: Not checking voice session availability
**Problem:** Calling tool without voice session in voice mode
**Solution:** Check `context.geminiSession` before relying on voice farewell delivery

### Mistake 5: Expecting idempotency
**Problem:** Assuming repeated calls with same params are safe
**Solution:** Each call EXTENDS timeout. Not idempotent. Use confirmation if needed.

### Mistake 6: Not handling WebSocket disconnection
**Problem:** Assuming timeout command always reaches client
**Solution:** Timeout is enforced server-side. Client localStorage is convenience, not requirement.
