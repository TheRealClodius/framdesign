# ignore_user

Punitive action tool that blocks disrespectful users for a specified duration (30s-24h) and immediately ends voice session with farewell message.

## Parameters

- **duration_seconds** (required): Timeout duration in seconds (min: 30, max: 86400 / 24 hours)
- **farewell_message** (required): Message spoken/sent to user before blocking (10-500 chars)

## Examples

**Second offense (moderate):**
```json
{
  "duration_seconds": 300,
  "farewell_message": "I gave you a warning. This conversation is over for now."
}
```
Blocks user for 5 minutes after delivering farewell message.

**Extreme abuse:**
```json
{
  "duration_seconds": 86400,
  "farewell_message": "You've crossed a serious line. You're blocked for 24 hours."
}
```
Maximum 24-hour timeout for severe violations.

**Text mode:**
```json
{
  "duration_seconds": 600,
  "farewell_message": "I don't tolerate disrespect in text either. Blocked for 10 minutes."
}
```
Works in both voice and text modes.

## Watch Out

- **Use only after warning**: First offense should get a firm warning ONLY. Use this tool on second offense or worse.
- **Not idempotent**: Each call EXTENDS timeout. Don't call multiple times carelessly.
- **Keep messages professional**: Firm and direct, not snarky or insulting. "I don't tolerate disrespect" not "Wow, you're dumb."
- **Meaningful durations**: Minimum 30s enforced, but use 300+ (5 min) for actual impact.
- **Different from end_voice_session**: This is PUNITIVE (blocks user). `end_voice_session` is graceful.
- **Immediate termination**: Voice session ends after farewell, text communication blocked until timeout expires.
