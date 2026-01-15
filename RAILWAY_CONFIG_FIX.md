# Railway Configuration Fix for Vector Search & Voice Services

## The Problem

Both services are deployed but return 403/404 errors because `ALLOWED_ORIGINS` doesn't include your frontend domain.

## Quick Fix

### 1. Vector Search API Configuration

In Railway dashboard for `vector-search-api-production`:

**Add/Update Environment Variable:**
```
ALLOWED_ORIGINS=http://localhost:3000,https://your-vercel-app.vercel.app,https://your-production-domain.com
```

Replace with your actual domains:
- Your Vercel app URL (e.g., `framdesign.vercel.app`)
- Your custom domain (if any)
- Keep `http://localhost:3000` for local development testing

### 2. Voice Server Configuration

In Railway dashboard for `voice-service-production`:

**Add/Update Environment Variable:**
```
ALLOWED_ORIGINS=http://localhost:3000,https://your-vercel-app.vercel.app,https://your-production-domain.com
```

Use the same domains as above.

### 3. Frontend Configuration

Your frontend (Vercel/Next.js app) needs these environment variables:

```bash
VECTOR_SEARCH_API_URL=https://vector-search-api-production.up.railway.app
NEXT_PUBLIC_VOICE_SERVER_URL=wss://voice-service-production-17a5.up.railway.app
```

**Important:**
- No trailing slash on `VECTOR_SEARCH_API_URL` (automatically sanitized)
- Use `wss://` (secure WebSocket) for `NEXT_PUBLIC_VOICE_SERVER_URL`
- No trailing slash on `NEXT_PUBLIC_VOICE_SERVER_URL` (automatically sanitized)
- Ensure no extra whitespace around URLs (automatically trimmed)
- After adding environment variables in Vercel/Railway, **you must redeploy** for changes to take effect

## Step-by-Step Railway Configuration

### Using Railway Dashboard:

1. Go to https://railway.app/dashboard
2. Select `vector-search-api-production` project
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add:
   - Name: `ALLOWED_ORIGINS`
   - Value: `http://localhost:3000,https://your-app.vercel.app`
6. Click **Add**
7. Railway will automatically redeploy

Repeat for `voice-service-production`.

### Using Railway CLI (if installed):

```bash
# For vector-search-api
cd vector-search-api
railway link  # Select the project
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-app.vercel.app"

# For voice-server
cd ../voice-server
railway link  # Select the project
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-app.vercel.app"
```

## What This Fixes

### Before:
- ❌ Vector search: `404 Not Found` (actually blocked by CORS)
- ❌ Voice: Stuck on "Starting..." (WebSocket connection rejected)

### After:
- ✅ Vector search: Works when services are properly configured
- ✅ Voice: Connects successfully to voice server

## Testing After Configuration

### Test Vector Search API:

```bash
# Health check (should work even without ALLOWED_ORIGINS)
curl https://vector-search-api-production.up.railway.app/health

# Status check
curl https://vector-search-api-production.up.railway.app/status

# Search test (from your frontend)
# This will work after ALLOWED_ORIGINS is configured
```

### Test Voice Server:

```bash
# Health check
curl https://voice-service-production-17a5.up.railway.app/health

# Voice connection test
# Click VOICE button in your app - should connect within 10 seconds
```

## Common Issues

### Issue: "Invalid WebSocket URL" Error

**Symptoms:**
- Error message: "Invalid WebSocket URL. Please configure NEXT_PUBLIC_VOICE_SERVER_URL"
- Voice button doesn't work

**Causes & Solutions:**

1. **Environment variable not set:**
   - Check that `NEXT_PUBLIC_VOICE_SERVER_URL` is set in your deployment platform (Vercel/Railway)
   - Must start with `wss://` (secure) or `ws://` (local dev only)
   - Example: `wss://voice-service-production.up.railway.app`

2. **Environment variable not loaded:**
   - In Next.js, `NEXT_PUBLIC_*` variables are embedded at build time
   - **You must redeploy your frontend** after adding/changing this variable
   - Simply adding the variable is not enough - rebuild is required

3. **Whitespace or formatting issues:**
   - Check for trailing slashes (now automatically removed)
   - Check for leading/trailing whitespace (now automatically trimmed)
   - Check browser console for diagnostic logs showing the actual URL value

4. **Local development:**
   - Create `.env.local` file in project root
   - Add: `NEXT_PUBLIC_VOICE_SERVER_URL=ws://localhost:8080`
   - Restart your dev server (`npm run dev`)

**Debug steps:**
1. Open browser console (F12)
2. Try to start voice session
3. Look for log message: `[Voice Service] Validating WebSocket URL:`
4. Check what value is being read - it will show the raw URL and validation results

### Issue: Still getting 404 after configuring ALLOWED_ORIGINS

**Possible causes:**
1. Railway hasn't finished redeploying (wait 2-3 minutes)
2. Your frontend is using old environment variables (redeploy frontend)
3. URL has trailing slash (now automatically removed)

### Issue: Voice connects but vector search fails

**Check:**
1. Is the vector database indexed? Test with:
   ```bash
   curl https://vector-search-api-production.up.railway.app/status
   ```
   Should show `document_count` > 0

2. If document_count is 0, the database needs indexing:
   - Railway builds the index during deployment
   - Check Railway logs for indexing errors
   - Trigger a redeploy to re-run the build command

### Issue: Everything works locally but fails in production

**Check environment variables are set in production:**
- Vercel dashboard → Your Project → Settings → Environment Variables
- Make sure `VECTOR_SEARCH_API_URL` and `NEXT_PUBLIC_VOICE_SERVER_URL` are set
- Redeploy after adding variables

## Verification Checklist

- [ ] `ALLOWED_ORIGINS` set on vector-search-api Railway service
- [ ] `ALLOWED_ORIGINS` set on voice-server Railway service
- [ ] Both services include your frontend domain(s) in ALLOWED_ORIGINS
- [ ] `VECTOR_SEARCH_API_URL` set in frontend environment variables
- [ ] `NEXT_PUBLIC_VOICE_SERVER_URL` set in frontend environment variables
- [ ] Frontend redeployed after setting environment variables
- [ ] Both Railway services redeployed after setting ALLOWED_ORIGINS
- [ ] Health endpoints return 200 OK
- [ ] Vector search status shows document_count > 0
- [ ] Voice button connects successfully
- [ ] Vector search queries return results

## Your Current URLs

```bash
# Vector Search API
https://vector-search-api-production.up.railway.app

# Voice Server
https://voice-service-production-17a5.up.railway.app

# Your Frontend (add your actual URL)
https://YOUR-APP.vercel.app
```

Replace `YOUR-APP.vercel.app` with your actual Vercel deployment URL.

---

**Need help finding your Vercel URL?**
- Go to https://vercel.com/dashboard
- Select your project
- Look for "Domains" section
- Copy the `.vercel.app` domain (or your custom domain)
