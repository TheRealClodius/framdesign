# Vercel Environment Variables Setup

This document lists all environment variables needed in Vercel for your Next.js app to work properly and communicate with the Railway Voice Server.

## Critical: Railway Voice Server Connection

**Required for voice functionality:**

```bash
NEXT_PUBLIC_VOICE_SERVER_URL=wss://framdesign-liveapi-production.up.railway.app
```

**Important:** 
- Use `wss://` (secure WebSocket) for production
- This URL must match your Railway deployment domain
- Railway's `ALLOWED_ORIGINS` already includes `https://framdesign.vercel.app` ✅

## Required Environment Variables

### 1. Voice Server (Railway Communication)
```bash
NEXT_PUBLIC_VOICE_SERVER_URL=wss://framdesign-liveapi-production.up.railway.app
```

### 2. Google Gemini API (for text chat)
```bash
GEMINI_API_KEY=your-gemini-api-key-here
```
**Note:** The code uses `GEMINI_API_KEY` (not `GOOGLE_GENAI_API_KEY`)

### 3. Email Functionality (Resend)
```bash
RESEND_API_KEY=re_your-resend-api-key-here
CONTACT_EMAIL=your-email@example.com
```

### 4. Google Analytics
```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

### 5. OpenAI API (if used)
```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
```

## Setting Variables in Vercel

### Using Vercel CLI:

```bash
# Voice Server URL (CRITICAL for Railway communication)
vercel env add NEXT_PUBLIC_VOICE_SERVER_URL production
# Enter: wss://framdesign-liveapi-production.up.railway.app

# Gemini API Key
vercel env add GEMINI_API_KEY production
# Enter your Gemini API key

# Resend API Key
vercel env add RESEND_API_KEY production
# Enter your Resend API key

# Contact Email
vercel env add CONTACT_EMAIL production
# Enter your contact email

# Google Analytics
vercel env add NEXT_PUBLIC_GA_MEASUREMENT_ID production
# Enter your GA4 Measurement ID

# OpenAI (if used)
vercel env add OPENAI_API_KEY production
# Enter your OpenAI API key
```

### Using Vercel Dashboard:

1. Go to your project: https://vercel.com/your-project
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:
   - **Key**: Variable name (e.g., `NEXT_PUBLIC_VOICE_SERVER_URL`)
   - **Value**: Variable value (e.g., `wss://framdesign-liveapi-production.up.railway.app`)
   - **Environment**: Select **Production** (and Preview/Development if needed)
4. Click **Save**

## Verification Checklist

After setting variables, verify:

- [ ] `NEXT_PUBLIC_VOICE_SERVER_URL` is set to Railway WebSocket URL
- [ ] Railway `ALLOWED_ORIGINS` includes your Vercel domain
- [ ] All required API keys are set
- [ ] Redeploy Vercel app after adding variables

## Testing the Connection

1. **Test Voice Server Health:**
   ```bash
   curl https://framdesign-liveapi-production.up.railway.app/health
   ```
   Should return: `{"status":"ok","timestamp":...}`

2. **Test from Browser:**
   - Open your Vercel deployment
   - Open browser console (F12)
   - Try to start a voice session
   - Check for WebSocket connection errors

3. **Check Railway Logs:**
   ```bash
   cd voice-server
   railway logs
   ```
   Look for connection attempts from your Vercel domain

## Troubleshooting

### WebSocket Connection Fails

1. **Check `NEXT_PUBLIC_VOICE_SERVER_URL`:**
   - Must start with `wss://` (not `ws://`)
   - Must match Railway domain exactly

2. **Check Railway `ALLOWED_ORIGINS`:**
   - Must include `https://framdesign.vercel.app`
   - No trailing slashes
   - Comma-separated, no spaces

3. **Check Browser Console:**
   - Look for CORS errors
   - Look for WebSocket connection errors
   - Verify the WebSocket URL being used

### Variables Not Working

1. **Redeploy after adding variables:**
   - Vercel requires redeployment for new environment variables

2. **Check variable names:**
   - `NEXT_PUBLIC_*` variables are exposed to browser
   - Non-prefixed variables are server-only

3. **Verify environment:**
   - Ensure variables are set for **Production** environment
   - Preview deployments use Preview environment variables

## Current Railway Configuration

**Railway Voice Server:**
- Domain: `framdesign-liveapi-production.up.railway.app`
- WebSocket URL: `wss://framdesign-liveapi-production.up.railway.app`
- Health Check: `https://framdesign-liveapi-production.up.railway.app/health`
- ALLOWED_ORIGINS: `http://localhost:3000,https://framdesign.vercel.app` ✅

**Vercel Deployment:**
- Domain: `https://framdesign.vercel.app`
- Needs: `NEXT_PUBLIC_VOICE_SERVER_URL` pointing to Railway ✅

## Quick Setup Command

```bash
# Set all required variables at once (replace with your actual values)
vercel env add NEXT_PUBLIC_VOICE_SERVER_URL production <<< "wss://framdesign-liveapi-production.up.railway.app"
vercel env add GEMINI_API_KEY production <<< "your-gemini-key"
vercel env add RESEND_API_KEY production <<< "your-resend-key"
vercel env add CONTACT_EMAIL production <<< "your-email@example.com"
vercel env add NEXT_PUBLIC_GA_MEASUREMENT_ID production <<< "G-XXXXXXXXXX"
```

Then redeploy:
```bash
vercel --prod
```
