# FRAM Voice Server

WebSocket proxy server for Gemini Live API. Protects API keys and handles real-time voice conversations.

## Architecture

```
Browser (ChatInterface) ← WebSocket → Voice Server ← Gemini Live API
                                      (Railway)
```

## Setup

### 1. Install Dependencies

```bash
cd voice-server
npm install
```

### 2. Environment Variables

Create `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=8080
ALLOWED_ORIGINS=http://localhost:3000,https://framdesign.com
```

### 3. Run Locally

```bash
npm run dev
```

Server will start on `ws://localhost:8080`

## Deployment to Railway

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for detailed step-by-step instructions.

### Quick Start

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Navigate to voice-server directory
cd voice-server

# 4. Initialize Railway project (name it: FRAM-WEBSITE-G-LIVE-API)
railway init

# 5. Link to project
railway link

# 6. Set environment variables
railway variables set GEMINI_API_KEY="your-api-key-here"
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-production-domain.com"

# 7. Deploy
railway up

# 8. Get your WebSocket URL
railway domain
```

**Important:** Use `wss://` (secure WebSocket) for the production URL from Railway.

### Environment Variables

Required environment variables:

- `GEMINI_API_KEY` (required) - Your Google Gemini API key
- `ALLOWED_ORIGINS` (required) - Comma-separated list of allowed origins (e.g., `http://localhost:3000,https://your-domain.com`)
- `PORT` (optional) - Railway auto-assigns this, don't override

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for complete deployment guide.

## Protocol

### Client → Server Messages

**Start Session:**
```json
{
  "type": "start",
  "systemPrompt": "You are FRAM...",
  "conversationHistory": []
}
```

**Send Audio:**
```json
{
  "type": "audio",
  "data": "base64_pcm_audio_data"
}
```

**Send Text:**
```json
{
  "type": "text",
  "data": "Hello"
}
```

**Stop Session:**
```json
{
  "type": "stop"
}
```

### Server → Client Messages

**Connected:**
```json
{
  "type": "connected",
  "clientId": "123-abc",
  "timestamp": 1234567890
}
```

**Session Started:**
```json
{
  "type": "started",
  "sessionId": "123-abc"
}
```

**Audio Response:**
```json
{
  "type": "audio",
  "data": "base64_pcm_audio_data"
}
```

**Text Response:**
```json
{
  "type": "text",
  "data": "Hello! How can I help?"
}
```

**Error:**
```json
{
  "type": "error",
  "error": "Error message"
}
```

## Monitoring

Health check endpoint: `http://localhost:8080/health`

Returns:
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

## Security

- **Origin validation**: Only configured origins can connect
- **API key protection**: Never exposed to browser
- **Rate limiting**: Add if needed (future enhancement)
- **Authentication**: Add if needed (future enhancement)
