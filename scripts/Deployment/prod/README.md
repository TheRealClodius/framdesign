# Production Deployment Scripts

This directory contains scripts for deploying to production environments.

## Voice Server Deployment

**File**: `deploy-voice-server.sh`

Automated Railway deployment script for the Voice Server.

### Usage

```bash
./scripts/Deployment/prod/deploy-voice-server.sh
```

Or from the project root:

```bash
chmod +x scripts/Deployment/prod/deploy-voice-server.sh
scripts/Deployment/prod/deploy-voice-server.sh
```

### Prerequisites

- Railway CLI installed: `npm install -g @railway/cli`
- Railway account set up
- Environment variables ready (see script prompts)

### What It Does

1. **Checks Railway CLI** - Verifies Railway CLI is installed
2. **Links to Railway** - Initializes or links to Railway project
3. **Sets Environment Variables** - Interactive setup for:
   - `GEMINI_API_KEY` or `VERTEXAI_PROJECT` + `VERTEXAI_LOCATION`
   - `ALLOWED_ORIGINS`
4. **Deploys** - Runs `railway up` to deploy
5. **Verifies** - Tests health endpoint and displays domain

### Environment Variables

**Required:**
- `GEMINI_API_KEY` (for AI Studio) OR
- `VERTEXAI_PROJECT` + `VERTEXAI_LOCATION` (for Vertex AI)
- `ALLOWED_ORIGINS` (comma-separated, no spaces)

**Optional:**
- `PORT` (Railway auto-assigns this)

### Related Documentation

- [Railway Deployment Guide](../../../voice-server/RAILWAY_DEPLOYMENT.md)
- [Deployment Checklist](../../../DEPLOYMENT_CHECKLIST.md)
- [Voice Server README](../../../voice-server/README.md)
