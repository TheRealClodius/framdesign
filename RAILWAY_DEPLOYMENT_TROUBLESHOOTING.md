# Railway Deployment Troubleshooting Guide

## Issue: Railway Deployment Failed After Vercel Fix

**Commit that triggered investigation:** `5b05439` (Vercel tool_registry.json fix)

---

## Quick Diagnosis

The Vercel fix (commit 5b05439) **only modified** `vercel.json` and `package-lock.json` - it did NOT change any voice-server files. Therefore, the Railway deployment failure is likely unrelated to the recent changes.

However, let's investigate common Railway deployment issues:

---

## Common Railway Deployment Failures

### 1. ❌ Missing Environment Variables (Most Likely)

The voice-server **immediately exits** if environment variables are missing:

```javascript
// From voice-server/server.js:57-61
if (!USE_VERTEX_AI && !GEMINI_API_KEY) {
  console.error('ERROR: Either GEMINI_API_KEY or VERTEXAI_PROJECT is required');
  process.exit(1); // <-- Service crashes on startup
}
```

**Required Environment Variables:**

#### Option A: Vertex AI (Recommended)
```bash
VERTEXAI_PROJECT=fram-design-website
VERTEXAI_LOCATION=us-central1  # Optional, defaults to us-central1
GOOGLE_APPLICATION_CREDENTIALS=<service account JSON>
ALLOWED_ORIGINS=http://localhost:3000,https://framdesign.vercel.app,https://fram.design
```

#### Option B: Google AI Studio (Limited - no Live API)
```bash
GEMINI_API_KEY=<your-api-key>
ALLOWED_ORIGINS=http://localhost:3000,https://framdesign.vercel.app,https://fram.design
```

**How to Check:**
1. Go to Railway Dashboard: https://railway.app/dashboard
2. Select your project: `FRAMDESIGN-LIVEAPI`
3. Click on `voice-service`
4. Go to **Variables** tab
5. Verify ALL required variables are set

**Common Mistakes:**
- ❌ Variable names have typos (e.g., `VERTEX_PROJECT` instead of `VERTEXAI_PROJECT`)
- ❌ JSON credentials are malformed
- ❌ Missing `ALLOWED_ORIGINS` causes CORS errors (not crashes, but connection failures)
- ❌ Trailing/leading spaces in variable values

---

### 2. ❌ Health Check Timeout

Railway's health check endpoint is `/health` with a 100-second timeout:

```json
// voice-server/railway.json:14-15
"healthcheckPath": "/health",
"healthcheckTimeout": 100
```

If the server doesn't respond within 100 seconds, Railway marks deployment as failed.

**Possible Causes:**
- Server crashes before health check (see #1 - missing env vars)
- Server hangs during tool registry loading
- Port binding issues

**How to Check:**
1. Railway Dashboard → `voice-service` → **Deployments** tab
2. Click on the failed deployment
3. Check **Logs** for startup errors
4. Look for these patterns:
   - `ERROR: Either GEMINI_API_KEY or VERTEXAI_PROJECT is required` → Missing env vars
   - No logs at all → Build failed (see #3)
   - Logs stop after "Loading tool registry..." → Tool loading issue

---

### 3. ❌ Build Failure

Railway build command: `npm install`

**Possible Causes:**
- Dependency installation fails
- Node version mismatch
- Optional dependencies (LanceDB) fail to install

**How to Check:**
1. Railway Dashboard → `voice-service` → **Deployments** tab
2. Click failed deployment → **Build Logs**
3. Look for npm install errors

**Common Errors:**
```bash
# LanceDB native module fails
npm error @lancedb/lancedb@0.23.0 install: ...
```

**Fix:** LanceDB is already in `optionalDependencies`, so this shouldn't fail the build. But if it does:

```json
// voice-server/package.json - already configured
"optionalDependencies": {
  "@lancedb/lancedb": "^0.23.0"
}
```

---

### 4. ❌ Port Binding Issues

Railway auto-sets the `PORT` environment variable. The voice-server correctly uses:

```javascript
const PORT = process.env.PORT || 8080;
```

**Potential Issue:** If you manually set `PORT` in Railway variables, it might conflict.

**Fix:** Remove any manual `PORT` variable from Railway dashboard.

---

### 5. ❌ Service Routing / Root Directory

According to `RAILWAY_FIX_REQUIRED.md`, the voice-service was previously deleted and recreated with:
- **Root Directory:** `voice-server`

**How to Verify:**
1. Railway Dashboard → `voice-service` → **Settings** tab
2. Check **Source** section
3. Verify "Root Directory" is set to: `voice-server`

If not set correctly:
1. Settings → Service → Root Directory
2. Set to: `voice-server`
3. Redeploy

---

### 6. ❌ Tool Registry Loading Issues

The voice-server has a **committed** `tool_registry.json` (unlike the root directory where it's gitignored):

```bash
$ git ls-files voice-server/tools/tool_registry.json
voice-server/tools/tool_registry.json  # ✅ Tracked in git
```

This file should be available during Railway deployment. However, if it's missing or corrupted:

**Symptoms:**
- Logs show: `Loading tool registry...` then crash
- Error: `ENOENT: no such file or directory, open '.../tool_registry.json'`

**Fix:** Verify the file exists in git:
```bash
git show HEAD:voice-server/tools/tool_registry.json | head -10
```

Expected output:
```json
{
  "version": "1.0.249a595d",
  "tools": [...],
  ...
}
```

---

## Step-by-Step Debugging

### Step 1: Check Railway Deployment Logs

```bash
# If Railway CLI is installed
railway logs --service voice-service

# Or via Railway Dashboard:
# Dashboard → voice-service → Deployments → [Latest] → Logs
```

**Look for these patterns:**

| Log Message | Issue | Fix |
|-------------|-------|-----|
| `ERROR: Either GEMINI_API_KEY or VERTEXAI_PROJECT is required` | Missing env vars | Add required variables (see #1) |
| `Error: listen EADDRINUSE` | Port already in use | Railway handles this automatically - shouldn't happen |
| `Error [ERR_MODULE_NOT_FOUND]` | Missing dependency | Check build logs |
| `Loading tool registry...` (then crash) | Tool registry issue | Check file exists in git |
| No logs at all | Build failed | Check build logs |

### Step 2: Verify Environment Variables

**Required Variables Checklist:**

- [ ] `VERTEXAI_PROJECT` (for Vertex AI) **OR** `GEMINI_API_KEY` (for AI Studio)
- [ ] `VERTEXAI_LOCATION` (optional, defaults to `us-central1`)
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` (for Vertex AI authentication)
- [ ] `ALLOWED_ORIGINS` (comma-separated, no spaces)

**Test locally to verify config:**
```bash
cd voice-server
export VERTEXAI_PROJECT=fram-design-website
export VERTEXAI_LOCATION=us-central1
export GOOGLE_APPLICATION_CREDENTIALS='<paste service account JSON>'
export ALLOWED_ORIGINS=http://localhost:3000,https://framdesign.vercel.app
npm start
```

Expected output:
```
Loading tool registry...
✓ Tool registry loaded: v1.0.249a595d, 5 tools, git commit: d665ace
Using Vertex AI (Project: fram-design-website, Location: us-central1)
✓ Using service account from GOOGLE_APPLICATION_CREDENTIALS (JSON string)
Voice Server starting on port 8080
```

### Step 3: Test Health Endpoint

After successful Railway deployment:
```bash
curl https://voice-service-production-17a5.up.railway.app/health
```

Expected response:
```json
{"status":"ok","timestamp":1736873100000}
```

### Step 4: Verify WebSocket Connection

From your browser console (on framdesign.vercel.app):
```javascript
const ws = new WebSocket('wss://voice-service-production-17a5.up.railway.app');
ws.onopen = () => console.log('✓ Connected');
ws.onerror = (err) => console.error('✗ Connection failed', err);
```

---

## Most Likely Solution

Based on the architecture and the fact that my recent commit didn't touch voice-server files, the most likely cause is:

### ⚠️ **Missing or Incorrect `GOOGLE_APPLICATION_CREDENTIALS`**

The voice-server requires Vertex AI authentication. If the service account JSON is missing, malformed, or expired, the service will fail to authenticate with Google Cloud and crash.

**Action Items:**
1. Go to Railway Dashboard → `voice-service` → **Variables**
2. Check if `GOOGLE_APPLICATION_CREDENTIALS` exists and is a valid JSON string
3. Verify the JSON structure:
   ```json
   {
     "type": "service_account",
     "project_id": "fram-design-website",
     "private_key_id": "...",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
     "client_email": "...@fram-design-website.iam.gserviceaccount.com",
     "client_id": "...",
     "auth_uri": "https://accounts.google.com/o/oauth2/auth",
     "token_uri": "https://oauth2.googleapis.com/token",
     ...
   }
   ```
4. If missing or invalid, regenerate from Google Cloud Console:
   - Go to: https://console.cloud.google.com/iam-admin/serviceaccounts?project=fram-design-website
   - Select service account → Keys → Add Key → Create New Key → JSON
   - Copy entire JSON contents
   - Paste into Railway's `GOOGLE_APPLICATION_CREDENTIALS` variable (as a string, no quotes needed)

5. Redeploy: Railway Dashboard → voice-service → **Deployments** → Redeploy

---

## Alternative: Use AI Studio API Key (Quick Test)

If you want to quickly test if the deployment works (without Live API features):

1. Get API key from: https://aistudio.google.com/app/apikey
2. Railway Dashboard → voice-service → **Variables**
3. **Remove** `VERTEXAI_PROJECT` and `GOOGLE_APPLICATION_CREDENTIALS`
4. **Add** `GEMINI_API_KEY=<your-key>`
5. Redeploy

**Note:** This limits functionality - Live API won't work, only standard API.

---

## Verification Checklist

After fixing the issue:

- [ ] Railway deployment shows "Active" status (not "Crashed")
- [ ] Health endpoint responds: `curl https://voice-service-production-17a5.up.railway.app/health`
- [ ] Logs show: `✓ Tool registry loaded`
- [ ] Logs show: `Voice Server starting on port <PORT>`
- [ ] No crash errors in logs
- [ ] WebSocket connection succeeds from Vercel frontend
- [ ] FRAM voice mode works in production

---

## Need More Help?

**Provide the following information:**

1. **Railway Deployment Logs:**
   - Dashboard → voice-service → Deployments → [Latest] → Logs
   - Copy the ENTIRE log output

2. **Railway Build Logs:**
   - Dashboard → voice-service → Deployments → [Latest] → Build Logs
   - Copy the ENTIRE build log output

3. **Environment Variables:**
   - Dashboard → voice-service → Variables
   - List the variable NAMES (not values) that are currently set

4. **Deployment Status:**
   - Dashboard → voice-service
   - What does the status show? (Active, Crashed, Building, etc.)

With this information, I can provide more specific troubleshooting.

---

## Summary

**What was changed in commit 5b05439:**
- ✅ Modified `vercel.json` to build tool_registry.json
- ✅ Updated `package-lock.json` (dependency lock)
- ❌ **NO changes to voice-server code or configuration**

**Why Railway might be failing:**
1. Missing/incorrect environment variables (most likely)
2. Health check timeout (due to crash from #1)
3. Service account credentials expired or malformed
4. Railway service configuration issue (root directory, port, etc.)

**Next steps:**
1. Check Railway logs for specific error
2. Verify all environment variables are set correctly
3. Test service account credentials
4. Redeploy after fixing configuration

The voice-server code is working correctly (verified locally). The issue is almost certainly configuration-related in the Railway deployment.
