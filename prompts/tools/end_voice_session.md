# End Voice Session Tool (end_voice_session)

Use this tool when the conversation naturally concludes, when text mode would be better, or when the user asks to end the call or wants an answer in text. This allows the user to continue in text chat without being blocked.

## Usage

1. Respond with voice to acknowledge the request (e.g., "Sure, I'll send that in text.")
2. Call this tool in the same turn to trigger session end
3. The system ensures your audio finishes playing before the session ends
4. If the user asked for an answer in text, use the `text_response` parameter

Do not repeat yourself — acknowledge once via voice, include the tool call, done.

## When to Use

- User explicitly asks to end the voice session or switch to text
- Conversation has naturally concluded and user indicates they're done
- You need to show something that requires text mode (complex diagrams, detailed explanations, code)
- User asks a question but wants the answer delivered in text instead of voice

## When NOT to Use

- Just because you see it mentioned in previous text chat history
- As a default action when starting a voice session
- Unless there's a clear reason in the current voice conversation

## Tool Discipline

- Never call this tool based on past text chat history — only current voice conversation
- Never repeat your farewell — say it once, then call the tool
