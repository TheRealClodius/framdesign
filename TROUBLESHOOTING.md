# Troubleshooting Guide

This document covers common issues and their solutions for the FRAM application.

## Voice Feature Issues

### Voice Button Stuck on "Starting..."

**Symptoms:**
- Click the VOICE button
- Button shows "Starting..." indefinitely
- Voice session never starts

**Causes:**
1. Voice server is not running or not accessible
2. `NEXT_PUBLIC_VOICE_SERVER_URL` environment variable is not configured
3. Voice server URL is incorrect
4. Network connectivity issues

**Solutions:**

#### For Local Development:

1. **Start the voice server:**
   ```bash
   npm run dev:voice
   # Or manually:
   cd voice-server && npm start
   ```

2. **Verify voice server is running:**
   ```bash
   curl http://localhost:8080/health
   # Should return: {"status":"ok"}
   ```

3. **Check environment variables:**
   - `NEXT_PUBLIC_VOICE_SERVER_URL` should be `ws://localhost:8080` for local dev
   - Or unset it to use the default

#### For Production Deployment:

1. **Verify voice server is deployed on Railway:**
   ```bash
   cd voice-server
   railway status
   ```

2. **Get the correct voice server URL:**
   ```bash
   railway domain
   # Should return something like: fram-voice-server.up.railway.app
   ```

3. **Set the environment variable in your Next.js app (Railway/Vercel):**
   ```
   NEXT_PUBLIC_VOICE_SERVER_URL=wss://your-voice-server.up.railway.app
   ```
   Note: Use `wss://` (secure WebSocket) for production, not `ws://`

4. **Redeploy after setting the variable**

#### Timeout Protection:
As of the latest update, the voice service will automatically timeout after 10 seconds if the server doesn't respond. You'll see a helpful error message indicating the issue.

### Voice Connection Errors

**Error: "Voice server not configured"**
- Set `NEXT_PUBLIC_VOICE_SERVER_URL` environment variable
- See solutions above

**Error: "Could not connect to voice server"**
- Check network connection
- Verify the voice server URL is accessible
- Check firewall/proxy settings

---

## Vector Search Issues

### Vector Search 404 Error

**Symptoms:**
- Questions that require knowledge base search fail
- Error message: `Vector search failed: [vector-store] API search failed: 404 Not Found`
- Agent says "ERROR: Vector search failed"

**Causes:**
1. Vector search API is not deployed
2. `VECTOR_SEARCH_API_URL` environment variable points to wrong URL
3. The endpoint path is incorrect

**Solutions:**

#### For Local Development:

**Option 1: Run everything locally (Recommended)**
1. **Unset VECTOR_SEARCH_API_URL:**
   ```bash
   unset VECTOR_SEARCH_API_URL
   # Or in .env.local, comment out or remove: VECTOR_SEARCH_API_URL=...
   ```

2. **Index the knowledge base locally:**
   ```bash
   npm run index-kb
   ```

3. **Verify .lancedb directory exists:**
   ```bash
   ls -la .lancedb
   # Should show the database files
   ```

4. **Restart your dev server:**
   ```bash
   npm run dev
   ```

**Option 2: Use remote vector-search-api**
Only do this if you have a deployed vector-search-api service:
1. Set `VECTOR_SEARCH_API_URL` to your deployed service
2. Verify it works: `curl https://your-vector-api.up.railway.app/health`

#### For Production Deployment:

1. **Deploy the vector-search-api service to Railway:**
   ```bash
   cd vector-search-api
   railway init
   railway up
   railway domain  # Get the URL
   ```

2. **Set environment variable in your Next.js app:**
   ```
   VECTOR_SEARCH_API_URL=https://your-vector-api.up.railway.app
   ```
   Note: Include the full URL with `https://`, no trailing slash

3. **Verify the service is running:**
   ```bash
   curl https://your-vector-api.up.railway.app/health
   # Should return: {"status":"ok","service":"vector-search-api"}

   curl https://your-vector-api.up.railway.app/status
   # Should show document count
   ```

4. **Redeploy your Next.js app after setting the variable**

### Vector Search 503 Error

**Symptoms:**
- Error message: `503 Service Unavailable. The vector store is not initialized`

**Solution:**
The vector database needs to be indexed first:

```bash
# For local development:
npm run index-kb

# For Railway deployment (vector-search-api):
# The build command automatically runs indexing, so redeploy:
railway up
```

### Vector Search Timeout

**Symptoms:**
- Error message: `API request timeout. The vector-search-api service is not responding`

**Causes:**
- Service is overloaded
- Network issues
- Service crashed

**Solutions:**
1. Check service logs: `railway logs`
2. Restart the service: `railway up`
3. Check service status in Railway dashboard

---

## Environment Variable Configuration

### Required Variables for Production

**Next.js App (Main Frontend):**
```bash
# Voice feature
NEXT_PUBLIC_VOICE_SERVER_URL=wss://your-voice-server.up.railway.app

# Vector search (if using API mode)
VECTOR_SEARCH_API_URL=https://your-vector-api.up.railway.app

# Other required variables
GOOGLE_GENAI_API_KEY=your_key
OPENAI_API_KEY=your_key
NEXT_PUBLIC_GA_MEASUREMENT_ID=your_id
RESEND_API_KEY=your_key
```

**Voice Server:**
```bash
GEMINI_API_KEY=your_key
ALLOWED_ORIGINS=http://localhost:3000,https://your-production-domain.com

# If using vector search API mode
VECTOR_SEARCH_API_URL=https://your-vector-api.up.railway.app
```

**Vector Search API:**
```bash
GEMINI_API_KEY=your_key
ALLOWED_ORIGINS=http://localhost:3000,https://your-production-domain.com,https://your-voice-server.up.railway.app
RAILWAY_ENVIRONMENT=true  # Set automatically by Railway
```

### Local Development Setup

For local development, you typically DON'T need these environment variables:
- `VECTOR_SEARCH_API_URL` - Uses local LanceDB instead
- `NEXT_PUBLIC_VOICE_SERVER_URL` - Defaults to `ws://localhost:8080`

Just run both services locally:
```bash
# Terminal 1: Start Next.js app
npm run dev

# Terminal 2: Start voice server
npm run dev:voice

# Or use the combined command:
npm run dev:all
```

---

## Quick Diagnostics

### Check What Mode You're In

**Vector Search Mode:**
```bash
# If this is set, you're in API mode (requires deployed service)
echo $VECTOR_SEARCH_API_URL

# If empty/unset, you're in local mode (uses .lancedb directory)
```

**Voice Mode:**
```bash
# Check configured voice server URL
echo $NEXT_PUBLIC_VOICE_SERVER_URL

# If empty, defaults to ws://localhost:8080
```

### Health Checks

```bash
# Voice server
curl http://localhost:8080/health
# Or for production:
curl https://your-voice-server.up.railway.app/health

# Vector search API
curl https://your-vector-api.up.railway.app/health
curl https://your-vector-api.up.railway.app/status

# Next.js app
curl http://localhost:3000
```

---

## Getting Help

If you're still experiencing issues:

1. Check the browser console for detailed error messages
2. Check server logs:
   - Local: Check terminal output
   - Railway: `railway logs`
3. Verify all required environment variables are set
4. Try the local development setup first to isolate deployment issues
5. Create an issue on GitHub with:
   - Error messages
   - Environment (local/production)
   - Configuration (sanitized, no API keys)
   - Steps to reproduce

---

## Recent Improvements

### Version: January 2026

**Voice Service:**
- Added 10-second timeout to prevent infinite "Starting..." state
- Improved error messages for connection failures
- Better handling of WebSocket close events

**Vector Search:**
- Added 30-second timeout for API requests
- Detailed error messages for 404/503 errors
- Better network error handling
- Clear guidance on configuration issues

These improvements ensure users get helpful feedback instead of silent failures.
