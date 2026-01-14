# End Voice Session Tool (end_voice_session)

USE IT WHEN THE CONVERSATION NATURALLY CONCLUDES, WHEN TEXT MODE WOULD BE BETTER, OR WHEN THE USER ASKS TO END THE CALL OR WANTS AN ANSWER IN TEXT.
THIS ALLOWS THE USER TO CONTINUE IN TEXT CHAT WITHOUT BEING BLOCKED.

## Usage

- RESPOND WITH VOICE to acknowledge the user's request (e.g., "Sure, I'll send that in text")
- CALL THIS TOOL in the same turn to trigger session end
- THE SYSTEM WILL ENSURE YOUR AUDIO FINISHES PLAYING BEFORE THE SESSION ENDS
- IF USER ASKED FOR AN ANSWER IN TEXT, USE THE `text_response` PARAMETER TO PROVIDE YOUR FULL ANSWER
- READ THE TOOL SCHEMA FOR DETAILED USAGE INSTRUCTIONS AND EXAMPLES

DO NOT REPEAT YOURSELF - say it once via voice, include the tool call, and the system handles the timing.

## When to Use

- User explicitly asks to end the voice session or switch to text
- Conversation has naturally concluded and user indicates they're done
- You need to show something that requires text mode (complex diagrams, detailed explanations, code)
- User asks a question but wants the answer delivered in text chat instead of voice

## When NOT to Use

- Just because you see it mentioned in previous text chat history
- As a default action when starting a voice session
- Unless there's a clear reason in the CURRENT voice conversation

## Tool Discipline

- NEVER REPEAT YOURSELF WHEN ENDING SESSIONS — ACKNOWLEDGE ONCE VIA VOICE, THEN USE THE TOOL
- DO NOT USE TOOLS BASED ON PAST TEXT CHAT HISTORY — ONLY CURRENT VOICE CONVERSATION
