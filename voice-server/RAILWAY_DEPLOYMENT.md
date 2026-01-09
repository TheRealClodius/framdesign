# Railway Deployment Guide

This guide walks you through deploying the FRAM Voice Server to Railway.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Railway CLI**: Install the Railway CLI
   ```bash
   npm install -g @railway/cli
   ```
3. **Google Gemini API Key**: Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Step-by-Step Deployment

### 1. Navigate to Voice Server Directory

```bash
cd voice-server
```

### 2. Login to Railway

```bash
railway login
```

This will open your browser to authenticate.

### 3. Initialize Railway Project

```bash
railway init
```

When prompted, name your project: **FRAM-WEBSITE-G-LIVE-API**

### 4. Link to Railway Project

```bash
railway link
```

Select the project you just created (or an existing one).

### 5. Set Environment Variables

Set the required environment variables. Choose **one** of the following options:

**Option A: Vertex AI (Recommended for Live API)**

```bash
# Required: Vertex AI Project ID
railway variables set VERTEXAI_PROJECT="your-gcp-project-id"

# Required: Vertex AI Location
railway variables set VERTEXAI_LOCATION="us-central1"

# Required: Allowed origins for WebSocket connections
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-production-domain.com"
```

**Note:** For Vertex AI, you'll need to authenticate using Google Cloud credentials. Railway supports this via service account keys or Application Default Credentials.

**Option B: Google AI Studio API Key (Standard API only)**

```bash
# Required: Your Google Gemini API key
railway variables set GEMINI_API_KEY="your-actual-api-key-here"

# Required: Allowed origins for WebSocket connections
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-production-domain.com"
```

**Important Notes:**
- Replace `your-gcp-project-id` with your actual Google Cloud Project ID (for Vertex AI)
- Replace `your-actual-api-key-here` with your real Gemini API key (for AI Studio)
- Replace `https://your-production-domain.com` with your actual production domain
- Include both development (`http://localhost:3000`) and production URLs
- No spaces after commas in `ALLOWED_ORIGINS`

### 6. Verify Environment Variables

```bash
railway variables
```

You should see:
- `VERTEXAI_PROJECT` and `VERTEXAI_LOCATION` (if using Vertex AI), OR
- `GEMINI_API_KEY` (if using AI Studio)
- `ALLOWED_ORIGINS`
- `PORT` (auto-set by Railway, don't override)

### 7. Deploy the Service

```bash
railway up
```

This will:
- Build your application using Nixpacks
- Deploy it to Railway
- Start the server automatically

### 8. Get Your Service URL

```bash
railway domain
```

This will show your Railway domain (e.g., `fram-website-g-live-api.up.railway.app`).

**Important:** Railway provides HTTPS by default, so use:
- **WebSocket URL**: `wss://fram-website-g-live-api.up.railway.app`
- **Health Check URL**: `https://fram-website-g-live-api.up.railway.app/health`

### 9. Test the Deployment

Test the health endpoint:

```bash
curl https://fram-website-g-live-api.up.railway.app/health
```

Expected response:
```json
{"status":"ok","timestamp":1234567890}
```

### 10. View Logs (Optional)

Monitor your deployment logs:

```bash
railway logs
```

Or view in the Railway dashboard at [railway.app](https://railway.app).

## Post-Deployment Configuration

### Update Next.js Environment Variables

After deployment, update your Next.js `.env.local` file:

```env
NEXT_PUBLIC_VOICE_SERVER_URL=wss://fram-website-g-live-api.up.railway.app
```

Replace `fram-website-g-live-api.up.railway.app` with your actual Railway domain.

### Update Production Environment Variables

If you have a production Next.js deployment, also set:

```env
NEXT_PUBLIC_VOICE_SERVER_URL=wss://fram-website-g-live-api.up.railway.app
```

## Railway Dashboard

You can also manage your deployment through the Railway web dashboard:

1. Go to [railway.app](https://railway.app)
2. Select your project: **FRAM-WEBSITE-G-LIVE-API**
3. Navigate to **Variables** tab to manage environment variables
4. Navigate to **Settings** tab to configure domains, health checks, etc.
5. Navigate to **Deployments** tab to view deployment history
6. Navigate to **Logs** tab to view real-time logs

## Troubleshooting

### Service Won't Start

1. **Check logs**: `railway logs`
2. **Verify environment variables**: `railway variables`
3. **Ensure credentials are set**: Either `VERTEXAI_PROJECT` (for Vertex AI) or `GEMINI_API_KEY` (for AI Studio) must be set. The server will exit if neither is present.
4. **For Vertex AI**: Ensure Google Cloud authentication is configured (service account or Application Default Credentials)

### WebSocket Connection Fails

1. **Check ALLOWED_ORIGINS**: Ensure your Next.js app URL is included
2. **Use `wss://` not `ws://`**: Railway uses HTTPS, so WebSockets must be secure
3. **Check Railway domain**: Verify with `railway domain`

### Health Check Fails

1. **Check server logs**: `railway logs`
2. **Verify PORT**: Railway auto-sets PORT, don't override it
3. **Test locally first**: Run `npm start` locally to verify server works

### CORS Errors

1. **Update ALLOWED_ORIGINS**: Add your domain to the comma-separated list
2. **No spaces**: Ensure no spaces after commas in ALLOWED_ORIGINS
3. **Include protocol**: Use `https://` for production, `http://` for localhost

## Updating the Deployment

After making code changes:

```bash
railway up
```

Railway will automatically rebuild and redeploy.

## Monitoring

- **Logs**: `railway logs` or Railway dashboard
- **Metrics**: View in Railway dashboard under your project
- **Health**: Check `/health` endpoint periodically

## Cost Considerations

Railway offers:
- **Free tier**: $5/month credit
- **Hobby plan**: $5/month + usage
- **Pro plan**: $20/month + usage

WebSocket connections consume minimal resources. Monitor usage in the Railway dashboard.

## Security Best Practices

1. **Never commit API keys**: Keep `GEMINI_API_KEY` in Railway variables only
2. **Restrict origins**: Only allow your actual domains in `ALLOWED_ORIGINS`
3. **Use HTTPS**: Railway provides this automatically
4. **Monitor logs**: Watch for suspicious activity

## Next Steps

After successful deployment:

1. ✅ Update Next.js `.env.local` with WebSocket URL
2. ✅ Test voice functionality in your app
3. ✅ Monitor Railway logs for errors
4. ✅ Set up monitoring/alerts if needed
5. ✅ Document your production WebSocket URL

## Support

- Railway Docs: [docs.railway.app](https://docs.railway.app)
- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
- Project Issues: Check your repository's issue tracker
