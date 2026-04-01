# FRAM Voice Server

WebSocket proxy server for Gemini Live API. Protects API keys and handles real-time voice conversations with tool calling.

## Architecture

```
Browser (Voice UI) ← WebSocket → Voice Server ← Gemini Live API
                                      (Railway)
```

## Setup

### 1. Install Dependencies

```bash
cd voice-server
npm install
```

### 2. Environment Variables

Create `voice-server/.env`:

```env
# Vertex AI Live (recommended)
VERTEXAI_PROJECT=your_gcp_project
VERTEXAI_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Optional fallback / utilities
GEMINI_API_KEY=your_ai_studio_key
GEMINI_VOICE_MODEL=gemini-3.1-flash-live-preview
QDRANT_CLUSTER_ENDPOINT=https://your-qdrant-url
QDRANT_API_KEY=your-qdrant-key
PERPLEXITY_API_KEY=your-perplexity-key
ALLOWED_ORIGINS=http://localhost:3000,https://framdesign.com
PORT=8080
```

### 3. Run Locally

```bash
npm run dev
```

Server starts on `ws://localhost:8080`.

## Gemini 3.1 Live migration notes

- Default voice model: `gemini-3.1-flash-live-preview`.
- `sendClientContent` is only used to seed initial history. Ongoing text/audio turns use realtime input.
- Pre-recorded or live audio turns should end with `sendRealtimeInput({ audioStreamEnd: true })` rather than `sendClientContent({ turnComplete: true })`.
- Proactive audio and affective dialogue are not enabled because Gemini 3.1 Flash Live does not support them.

## Deployment to Railway

See `RAILWAY_DEPLOYMENT.md` for step-by-step instructions.

### Quick Start

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Navigate to voice-server directory
cd voice-server

# 4. Initialize Railway project
railway init

# 5. Link to project
railway link

# 6. Set environment variables
railway variables set VERTEXAI_PROJECT="your-project"
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-domain.com"
# Add credentials per Railway guidelines

# 7. Deploy
railway up
```

Use `wss://` for production WebSocket URL from Railway.

## Protocol

### Client → Server Messages

**Start Session:**
```json
{
  "type": "start",
  "conversationHistory": [{ "role": "user", "content": "Hi" }],
  "pendingRequest": "Optional pending request from text agent",
  "userId": "optional-user-id"
}
```

**Send Audio:**
```json
{ "type": "audio", "data": "base64_pcm_audio_data" }
```

**Send Text:**
```json
{ "type": "text", "data": "Hello" }
```

**Stop Session:**
```json
{ "type": "stop" }
```

### Server → Client Messages

**Connected:**
```json
{ "type": "connected", "clientId": "123-abc", "timestamp": 1234567890 }
```

**Session Started:**
```json
{ "type": "started", "sessionId": "123-abc" }
```

**Tool Call Started (for UI thinking sound):**
```json
{ "type": "tool_call_started", "toolCount": 2 }
```

**Audio Response:**
```json
{ "type": "audio", "data": "base64_pcm_audio_data" }
```

**Text Response:**
```json
{ "type": "text", "data": "Hello! How can I help?" }
```

**Error:**
```json
{ "type": "error", "error": "Error message" }
```

## Monitoring

Health check endpoint: `http://localhost:8080/health`

Returns:
```json
{ "status": "ok", "timestamp": 1234567890 }
```

## Security

- Origin validation: only configured origins can connect
- API key protection: never exposed to the browser
- Rate limiting: not enabled by default
- Authentication: not enabled by default
