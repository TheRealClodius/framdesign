# Railway Deployment - Quick Start Guide

This is a condensed version of the Railway deployment guide. For detailed instructions, see [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md).

## Prerequisites

1. Install Railway CLI: `npm install -g @railway/cli`
2. Create Railway account: [railway.app](https://railway.app)
3. Get required API keys (see below)

## Voice Server Deployment

```bash
cd voice-server

# Login and initialize
railway login
railway init  # Name: FRAM-WEBSITE-G-LIVE-API
railway link

# Set environment variables
railway variables set GEMINI_API_KEY="your-key"  # OR use Vertex AI
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-domain.com"

# Deploy
railway up

# Get your URL
railway domain  # Use wss:// prefix for WebSocket
```

## Next.js App Deployment

```bash
# From project root

# Login and initialize
railway login
railway init  # Name: FRAM-WEBSITE
railway link

# Set environment variables
railway variables set NEXT_PUBLIC_VOICE_SERVER_URL="wss://your-voice-server.up.railway.app"
railway variables set NEXT_PUBLIC_GA_MEASUREMENT_ID="G-XXXXXXXXXX"
railway variables set RESEND_API_KEY="re_your-key"
railway variables set GOOGLE_GENAI_API_KEY="your-key"
railway variables set OPENAI_API_KEY="sk-your-key"

# Deploy
railway up

# Get your URL
railway domain
```

## Required Environment Variables

### Voice Server
- `GEMINI_API_KEY` OR `VERTEXAI_PROJECT` + `VERTEXAI_LOCATION`
- `ALLOWED_ORIGINS` (comma-separated, no spaces)

### Next.js App
- `NEXT_PUBLIC_VOICE_SERVER_URL` (from Voice Server deployment)
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `RESEND_API_KEY`
- `GOOGLE_GENAI_API_KEY`
- `OPENAI_API_KEY`

## Post-Deployment

1. Update Voice Server `ALLOWED_ORIGINS` to include Next.js app domain
2. Test both services
3. Configure custom domains (optional)

## Useful Commands

```bash
# View logs
railway logs

# Check environment variables
railway variables

# Get service URL
railway domain

# Test health endpoint
curl https://your-voice-server.up.railway.app/health
```

## Troubleshooting

- **Service won't start**: Check `railway logs` and verify environment variables
- **WebSocket fails**: Ensure `ALLOWED_ORIGINS` includes your domain and use `wss://`
- **Build fails**: Check Node.js version and dependencies

For detailed troubleshooting, see [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md#troubleshooting).
