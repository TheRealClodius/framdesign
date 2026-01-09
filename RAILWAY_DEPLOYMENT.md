# Railway Deployment Guide

Complete guide for deploying both the Voice Server and Next.js application to Railway.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Voice Server Deployment](#voice-server-deployment)
3. [Next.js Application Deployment](#nextjs-application-deployment)
4. [Post-Deployment Configuration](#post-deployment-configuration)
5. [Troubleshooting](#troubleshooting)
6. [Monitoring](#monitoring)

---

## Prerequisites

### 1. Railway Account

- Sign up at [railway.app](https://railway.app)
- Railway offers a free tier with $5/month credit

### 2. Railway CLI

Install the Railway CLI globally:

```bash
npm install -g @railway/cli
```

### 3. Required API Keys

**For Voice Server:**
- **Option A (Recommended for Live API)**: Vertex AI credentials
  - Google Cloud Project with Vertex AI API enabled
  - Service account credentials or gcloud authentication
- **Option B**: Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/app/apikey)
  - Note: Live API requires Vertex AI, not AI Studio keys

**For Next.js App:**
- Google Analytics 4 Measurement ID
- Resend API Key (for contact form)
- Google Generative AI API Key
- OpenAI API Key

### 4. Domain Configuration

Decide on your production domains:
- Voice Server: `fram-website-g-live-api.up.railway.app` (or custom domain)
- Next.js App: Your production domain (e.g., `framdesign.com`)

---

## Voice Server Deployment

The Voice Server is a WebSocket server that proxies connections to Google's Gemini Live API.

### Step 1: Navigate to Voice Server Directory

```bash
cd voice-server
```

### Step 2: Login to Railway

```bash
railway login
```

This opens your browser for authentication.

### Step 3: Initialize Railway Project

```bash
railway init
```

When prompted, name your project: **FRAM-WEBSITE-G-LIVE-API**

### Step 4: Link to Railway Project

```bash
railway link
```

Select the project you just created.

### Step 5: Set Environment Variables

**For Vertex AI (Recommended for Live API):**

```bash
railway variables set VERTEXAI_PROJECT="your-gcp-project-id"
railway variables set VERTEXAI_LOCATION="us-central1"
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-production-domain.com"
```

**For AI Studio API Key (Standard API only):**

```bash
railway variables set GEMINI_API_KEY="your-actual-api-key-here"
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-production-domain.com"
```

**Important Notes:**
- Replace `your-production-domain.com` with your actual production domain
- Include both development (`http://localhost:3000`) and production URLs
- No spaces after commas in `ALLOWED_ORIGINS`
- Railway auto-sets `PORT` - don't override it

### Step 6: Verify Environment Variables

```bash
railway variables
```

You should see:
- `VERTEXAI_PROJECT` and `VERTEXAI_LOCATION` (if using Vertex AI), OR
- `GEMINI_API_KEY` (if using AI Studio)
- `ALLOWED_ORIGINS`
- `PORT` (auto-set by Railway)

### Step 7: Deploy the Service

```bash
railway up
```

This will:
- Build your application using Nixpacks
- Deploy it to Railway
- Start the server automatically

### Step 8: Get Your Service URL

```bash
railway domain
```

This shows your Railway domain (e.g., `fram-website-g-live-api.up.railway.app`).

**Important:** Railway provides HTTPS by default, so use:
- **WebSocket URL**: `wss://fram-website-g-live-api.up.railway.app`
- **Health Check URL**: `https://fram-website-g-live-api.up.railway.app/health`

### Step 9: Test the Deployment

Test the health endpoint:

```bash
curl https://fram-website-g-live-api.up.railway.app/health
```

Expected response:
```json
{"status":"ok","timestamp":1234567890}
```

### Step 10: View Logs

Monitor your deployment logs:

```bash
railway logs
```

Or view in the Railway dashboard at [railway.app](https://railway.app).

---

## Next.js Application Deployment

### Step 1: Navigate to Project Root

```bash
cd /path/to/framdesign
```

### Step 2: Login to Railway (if not already logged in)

```bash
railway login
```

### Step 3: Initialize Railway Project

```bash
railway init
```

When prompted, name your project: **FRAM-WEBSITE** (or your preferred name)

### Step 4: Link to Railway Project

```bash
railway link
```

Select the project you just created.

### Step 5: Set Environment Variables

```bash
# Analytics
railway variables set NEXT_PUBLIC_GA_MEASUREMENT_ID="G-XXXXXXXXXX"

# Email (Resend)
railway variables set RESEND_API_KEY="re_your-resend-api-key"

# AI APIs
railway variables set GOOGLE_GENAI_API_KEY="your-google-genai-api-key"
railway variables set OPENAI_API_KEY="sk-your-openai-api-key"

# Voice Server URL (from Voice Server deployment)
railway variables set NEXT_PUBLIC_VOICE_SERVER_URL="wss://fram-website-g-live-api.up.railway.app"
```

**Important:** Replace all placeholder values with your actual keys and the Voice Server URL from Step 8 of Voice Server deployment.

### Step 6: Configure Build Settings

Railway should auto-detect Next.js, but verify in the Railway dashboard:

1. Go to your project → **Settings**
2. Ensure **Build Command** is: `npm run build`
3. Ensure **Start Command** is: `npm start`
4. Ensure **Root Directory** is: `/` (project root)

### Step 7: Deploy the Application

```bash
railway up
```

This will:
- Install dependencies
- Build the Next.js application
- Deploy and start the server

### Step 8: Get Your Application URL

```bash
railway domain
```

This shows your Railway domain (e.g., `fram-website.up.railway.app`).

### Step 9: Configure Custom Domain (Optional)

1. Go to Railway dashboard → Your project → **Settings** → **Domains**
2. Click **Generate Domain** or **Add Custom Domain**
3. Follow Railway's instructions for DNS configuration

### Step 10: Test the Deployment

Visit your Railway URL in a browser:
- `https://fram-website.up.railway.app`

Test key features:
- Homepage loads correctly
- Chat interface works
- Voice functionality connects to Voice Server
- Contact form submits successfully

---

## Post-Deployment Configuration

### Update Voice Server ALLOWED_ORIGINS

After deploying the Next.js app, update the Voice Server's `ALLOWED_ORIGINS` to include the new domain:

```bash
cd voice-server
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://fram-website.up.railway.app,https://your-custom-domain.com"
```

### Update Next.js Environment Variables

If you need to update the Voice Server URL:

```bash
railway variables set NEXT_PUBLIC_VOICE_SERVER_URL="wss://fram-website-g-live-api.up.railway.app"
```

### Verify Environment Variables

**Voice Server:**
```bash
cd voice-server
railway variables
```

**Next.js App:**
```bash
railway variables
```

---

## Troubleshooting

### Voice Server Issues

#### Service Won't Start

1. **Check logs**: `railway logs` (from voice-server directory)
2. **Verify environment variables**: `railway variables`
3. **Ensure credentials are set**: Either `VERTEXAI_PROJECT` or `GEMINI_API_KEY` must be set
4. **Check Node.js version**: Ensure Node.js 20+ is specified in `package.json`

#### WebSocket Connection Fails

1. **Check ALLOWED_ORIGINS**: Ensure your Next.js app URL is included
2. **Use `wss://` not `ws://`**: Railway uses HTTPS, so WebSockets must be secure
3. **Check Railway domain**: Verify with `railway domain`
4. **Check browser console**: Look for CORS or connection errors

#### Health Check Fails

1. **Check server logs**: `railway logs`
2. **Verify PORT**: Railway auto-sets PORT, don't override it
3. **Test locally first**: Run `npm start` locally to verify server works

### Next.js Application Issues

#### Build Fails

1. **Check build logs**: `railway logs`
2. **Verify Node.js version**: Ensure compatible version (18+)
3. **Check dependencies**: Ensure `package.json` has all required dependencies
4. **Check environment variables**: All required variables must be set

#### Application Won't Start

1. **Check logs**: `railway logs`
2. **Verify start command**: Should be `npm start`
3. **Check port**: Next.js should use Railway's `PORT` environment variable
4. **Verify environment variables**: All `NEXT_PUBLIC_*` variables must be set

#### Voice Feature Not Working

1. **Check Voice Server URL**: Verify `NEXT_PUBLIC_VOICE_SERVER_URL` is set correctly
2. **Check ALLOWED_ORIGINS**: Ensure Next.js domain is in Voice Server's allowed origins
3. **Check browser console**: Look for WebSocket connection errors
4. **Test Voice Server directly**: Use `curl` to test `/health` endpoint

### CORS Errors

1. **Update ALLOWED_ORIGINS**: Add your domain to the comma-separated list
2. **No spaces**: Ensure no spaces after commas in `ALLOWED_ORIGINS`
3. **Include protocol**: Use `https://` for production, `http://` for localhost
4. **Redeploy**: After updating `ALLOWED_ORIGINS`, redeploy the Voice Server

---

## Monitoring

### Railway Dashboard

Access both services in the Railway dashboard:
1. Go to [railway.app](https://railway.app)
2. Select your project
3. Navigate to different tabs:
   - **Deployments**: View deployment history
   - **Logs**: Real-time logs
   - **Metrics**: CPU, memory, network usage
   - **Variables**: Environment variables
   - **Settings**: Domain, health checks, etc.

### Health Checks

**Voice Server:**
```bash
curl https://fram-website-g-live-api.up.railway.app/health
```

**Next.js App:**
- Visit the homepage
- Check Railway logs for errors

### Logs

**View logs via CLI:**

```bash
# Voice Server logs
cd voice-server
railway logs

# Next.js App logs
railway logs
```

**View logs in dashboard:**
- Go to Railway dashboard → Your project → **Logs** tab

### Metrics

Monitor resource usage:
- CPU usage
- Memory usage
- Network traffic
- Request count

Available in Railway dashboard → Your project → **Metrics** tab.

---

## Updating Deployments

### After Code Changes

**Voice Server:**
```bash
cd voice-server
railway up
```

**Next.js App:**
```bash
railway up
```

Railway will automatically rebuild and redeploy.

### After Environment Variable Changes

1. Update variables via CLI or dashboard
2. Railway will automatically restart the service
3. No need to redeploy

---

## Cost Considerations

Railway offers:
- **Free tier**: $5/month credit
- **Hobby plan**: $5/month + usage
- **Pro plan**: $20/month + usage

**Estimated costs:**
- Voice Server: Minimal (WebSocket connections are lightweight)
- Next.js App: Depends on traffic and build frequency

Monitor usage in the Railway dashboard.

---

## Security Best Practices

1. **Never commit API keys**: Keep all secrets in Railway variables only
2. **Restrict origins**: Only allow your actual domains in `ALLOWED_ORIGINS`
3. **Use HTTPS**: Railway provides this automatically
4. **Monitor logs**: Watch for suspicious activity
5. **Rotate API keys**: Periodically rotate your API keys
6. **Use different keys**: Use different keys for development and production if possible
7. **Enable Railway 2FA**: Enable two-factor authentication on your Railway account

---

## Quick Reference

### Voice Server Commands

```bash
cd voice-server
railway login
railway init
railway link
railway variables set GEMINI_API_KEY="your-key"
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-domain.com"
railway up
railway domain
railway logs
```

### Next.js App Commands

```bash
railway login
railway init
railway link
railway variables set NEXT_PUBLIC_VOICE_SERVER_URL="wss://your-voice-server.up.railway.app"
railway variables set NEXT_PUBLIC_GA_MEASUREMENT_ID="G-XXXXXXXXXX"
railway variables set RESEND_API_KEY="re_your-key"
railway variables set GOOGLE_GENAI_API_KEY="your-key"
railway variables set OPENAI_API_KEY="sk-your-key"
railway up
railway domain
railway logs
```

---

## Support

- Railway Docs: [docs.railway.app](https://docs.railway.app)
- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
- Project Issues: Check your repository's issue tracker

---

## Next Steps

After successful deployment:

1. ✅ Test all features (chat, voice, contact form)
2. ✅ Configure custom domains (if desired)
3. ✅ Set up monitoring/alerts
4. ✅ Document your production URLs
5. ✅ Update any hardcoded URLs in your codebase
6. ✅ Set up CI/CD for automatic deployments (optional)
