# Railway Voice Service - Fixed!

## ✅ Deployment Status: SUCCESS

The voice-service has been successfully redeployed after deleting and recreating the service via Railway GraphQL API.

**New Service URL:** `wss://voice-service-production-17a5.up.railway.app`
**Health Check:** `https://voice-service-production-17a5.up.railway.app/health`

## Previous Issue

The voice-service deployments were failing with "Deployment does not have an associated build" error. This was fixed by deleting and recreating the service via Railway GraphQL API.

## Solution: Delete and Recreate the Service

The voice-server is now **self-contained** (all tools, prompts, and lib files are copied inside voice-server/). Follow these steps to fix the deployment:

### Step 1: Delete the Current voice-service

1. Go to Railway Dashboard: https://railway.com/dashboard
2. Open the FRAMDESIGN-LIVEAPI project
3. Click on the voice-service
4. Go to Settings → Danger Zone → Delete Service

### Step 2: Create a New Service

1. In the FRAMDESIGN-LIVEAPI project, click "New" → "GitHub Repo"
2. Select the framdesign repository
3. **CRITICAL: Set Root Directory to `voice-server`**
4. Name the service `voice-service`

### Step 3: Configure Environment Variables

Add these environment variables to the new service:
- `VERTEXAI_PROJECT=fram-design-website`
- `VERTEXAI_LOCATION=us-central1`
- `GOOGLE_APPLICATION_CREDENTIALS=<paste the service account JSON>`
- `ALLOWED_ORIGINS=http://localhost:3000,https://framdesign.vercel.app,https://fram.design`
- `VECTOR_SEARCH_API_URL=https://vector-search-api-production.up.railway.app`

### Step 4: Verify Deployment

After deployment succeeds:
1. Check the /health endpoint: `https://<service-url>/health`
2. The response should be: `{"status":"ok","timestamp":...}`

## Why This Happened

The previous service had a broken source configuration that prevented builds from even starting. All deployments failed immediately with "Deployment does not have an associated build" error, which cannot be fixed via CLI - it requires service recreation.

## Voice Server Architecture

The voice-server is now self-contained:
```
voice-server/
├── server.js           # Main server
├── config.js           # System prompt config
├── prompt-loader.js    # Loads prompts
├── prompts/            # Copied from root prompts/
│   ├── core.md
│   ├── voice-behavior.md
│   └── tools/
├── tools/              # Copied from root tools/
│   ├── _core/
│   ├── end-voice-session/
│   ├── ignore-user/
│   ├── kb-get/
│   ├── kb-search/
│   └── start-voice-session/
├── lib/services/       # Copied from root lib/services/
│   ├── embedding-service.ts
│   └── vector-store-service.ts
└── railway.json        # Railway config
```

This self-contained structure means Railway can deploy directly from voice-server/ without needing access to parent directories.
