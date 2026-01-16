# Railway Deployment Fix Guide

## Issue
Railway CLI shows: "the linked service doesn't exist"

## Solution Options

### Option 1: Relink to Existing Service (Recommended)

1. **List available services:**
   ```bash
   railway service
   ```
   Select your voice server service from the list.

2. **If service exists, link to it:**
   ```bash
   railway link
   ```
   Select the service when prompted.

3. **Deploy:**
   ```bash
   railway up
   ```

### Option 2: Deploy from voice-server Directory

If Railway is configured to deploy from `voice-server` directory:

1. **Navigate to voice-server:**
   ```bash
   cd voice-server
   ```

2. **Link to Railway:**
   ```bash
   railway link
   ```

3. **Deploy:**
   ```bash
   railway up
   ```

### Option 3: Create New Service

If the service was deleted or doesn't exist:

1. **From project root:**
   ```bash
   railway init
   ```
   Name it: `FRAMDESIGN-LIVEAPI` or your preferred name

2. **Link to the new project:**
   ```bash
   railway link
   ```

3. **Set environment variables:**
   ```bash
   railway variables set GEMINI_API_KEY="your-api-key"
   railway variables set ALLOWED_ORIGINS="https://your-domain.com"
   # OR for Vertex AI:
   railway variables set VERTEXAI_PROJECT="your-project-id"
   railway variables set VERTEXAI_LOCATION="us-central1"
   ```

4. **Deploy:**
   ```bash
   railway up
   ```

## Verify Deployment

1. **Check logs:**
   ```bash
   railway logs
   ```

2. **Get domain:**
   ```bash
   railway domain
   ```

3. **Test health endpoint:**
   ```bash
   curl https://your-railway-domain.up.railway.app/health
   ```

## Configuration Notes

- The root `railway.json` is configured to build and run from `voice-server` directory
- Health check endpoint: `/health`
- Health check timeout: 300 seconds
- Uses `npm ci` for faster, reliable builds

## Troubleshooting

If deployment still fails:

1. **Check Railway dashboard:** https://railway.app
   - Verify service exists
   - Check build logs
   - Verify environment variables

2. **Check build logs:**
   ```bash
   railway logs --deployment
   ```

3. **Verify Node.js version:**
   - Ensure `voice-server/package.json` specifies `node >= 20.0.0`
   - Railway should auto-detect this

4. **Common issues:**
   - Missing environment variables (GEMINI_API_KEY or VERTEXAI_PROJECT)
   - Build timeout (increase in Railway dashboard)
   - Port conflicts (Railway auto-assigns PORT)
