# end_voice_session

Gracefully terminates voice session while allowing conversation to continue in text mode. Voice mode only.

## Parameters

- **reason** (required): Why session is ending
  - `"user_request"`: User asked to end voice or switch to text
  - `"task_complete"`: Conversation naturally concluded
  - `"switch_to_text"`: Need to show code/diagrams in text
- **final_message** (optional): Last message spoken before ending (5-200 chars)

## Examples

**User requested end:**
```json
{
  "reason": "user_request",
  "final_message": "Ending voice session. Feel free to continue in text."
}
```
Speaks farewell, then ends voice session. Text chat remains available.

**Task complete:**
```json
{
  "reason": "task_complete",
  "final_message": "Great conversation. Talk soon!"
}
```
Natural end after conversation concludes.

**Silent switch to text:**
```json
{
  "reason": "switch_to_text"
}
```
No final message, just end voice mode (useful for showing code/diagrams).

## Watch Out

- **Voice mode only**: Won't work in text mode (no voice session to end).
- **Not punishment**: This is graceful termination. Use `ignore_user` for punitive timeouts.
- **WebSocket stays open**: Only ends voice session, not the underlying connection. Text chat continues.
- **Keep messages brief**: Final message max 200 chars (1-2 sentences).
- **Is idempotent**: Safe to call multiple times with same reason.
- **Use appropriately**: Only when conversation naturally concludes or user explicitly requests. Don't end mid-conversation.
