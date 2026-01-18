# Deployment Guide

Complete guide for deploying FRAM Design application with images and all assets.

## Overview

Your application consists of two parts:
1. **Next.js Frontend** → Deploys to **Vercel**
2. **Voice Server** → Deploys to **Railway**

Images in `public/kb-assets/` are automatically included in the Next.js build and will be served as static assets.

---

## Prerequisites

1. **GitHub repository** connected to Vercel
2. **Railway account** (for voice server)
3. **Environment variables** ready (API keys, etc.)

---

## Step 1: Prepare Images & Assets

### ✅ Verify Images Are in Place

Images should be in `public/kb-assets/` directory. They will be automatically included in the build:

```bash
# Check your images are present
ls -la public/kb-assets/
```

### ✅ Add Images to Git (if not already committed)

**Important:** Images must be committed to git for Vercel to include them in the build:

```bash
# Add all images to git
git add public/kb-assets/

# Verify they're staged
git status

# Commit them
git commit -m "Add kb-assets images"
```

**Note:** If images are very large (>100MB total), consider using Git LFS:
```bash
git lfs install
git lfs track "public/kb-assets/**/*.{png,jpg,jpeg,gif}"
git add .gitattributes
git add public/kb-assets/
```

### ✅ Update Asset Manifest (if needed)

If you've added new images, update `kb/assets/manifest.json` with metadata:

```bash
# Edit the manifest file
code kb/assets/manifest.json
```

### ✅ Re-run Embeddings (if you added new assets)

After adding new images to the manifest, regenerate embeddings:

```bash
npm run embed-kb
```

This will:
- Read assets from `kb/assets/manifest.json`
- Generate embeddings for new assets
- Update your Qdrant vector database

**Note:** Make sure your Qdrant instance is accessible from your deployment environment.

---

## Step 2: Deploy Frontend to Vercel

### Option A: Automatic Deployment (Recommended)

If your GitHub repo is connected to Vercel:

1. **Push your changes:**
   ```bash
   git add .
   git commit -m "Add images and update deployment"
   git push origin main
   ```

2. **Vercel will automatically:**
   - Detect the push
   - Run `npm run build:tools && npm run build` (from `vercel.json`)
   - Deploy to production

3. **Verify deployment:**
   - Check Vercel dashboard: https://vercel.com/dashboard
   - Visit your production URL
   - Test image loading: `https://your-domain.com/kb-assets/semantic-space/Semantic%20Space%20design%20sketch%20beginnings.png`

### Option B: Manual Deployment via Vercel CLI

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Login
vercel login

# Deploy to production
vercel --prod
```

### Environment Variables for Vercel

Set these in Vercel dashboard → Project Settings → Environment Variables:

**Required:**
- `OPENAI_API_KEY` - For text chat
- `QDRANT_URL` - Your Qdrant instance URL
- `QDRANT_API_KEY` - Qdrant API key (if required)

**Optional:**
- `NEXT_PUBLIC_*` - Any public environment variables your app needs

**To set via CLI:**
```bash
vercel env add OPENAI_API_KEY
vercel env add QDRANT_URL
vercel env add QDRANT_API_KEY
```

---

## Step 3: Deploy Voice Server to Railway

### Quick Deployment

```bash
# Navigate to voice-server directory
cd voice-server

# Install Railway CLI (if not installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your Railway project (or create new one)
railway link

# Set environment variables
railway variables set GEMINI_API_KEY="your-api-key-here"
railway variables set ALLOWED_ORIGINS="https://your-vercel-domain.com,https://www.your-domain.com"

# Deploy
railway up

# Get your WebSocket URL
railway domain
```

### Using Deployment Script

```bash
# From project root
chmod +x scripts/Deployment/prod/deploy-voice-server.sh
./scripts/Deployment/prod/deploy-voice-server.sh
```

### Environment Variables for Railway

**Required:**
- `GEMINI_API_KEY` - Google Gemini API key (or use Vertex AI credentials)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed origins (no spaces!)

**Example:**
```bash
railway variables set ALLOWED_ORIGINS="https://framdesign.vercel.app,https://framdesign.com"
```

**For Vertex AI (instead of Gemini API):**
```bash
railway variables set VERTEXAI_PROJECT="your-gcp-project-id"
railway variables set VERTEXAI_LOCATION="us-central1"
railway variables set GOOGLE_APPLICATION_CREDENTIALS='{"type":"service_account",...}'
```

See [RAILWAY_ENV_SETUP.md](./RAILWAY_ENV_SETUP.md) for detailed instructions.

---

## Step 4: Update Frontend to Use Voice Server URL

After deploying the voice server, update your frontend environment variables:

1. **Get Railway WebSocket URL:**
   ```bash
   railway domain
   ```
   Example: `framdesign-voice-server.up.railway.app`

2. **Set in Vercel:**
   ```bash
   vercel env add VOICE_SERVER_URL
   # Enter: wss://framdesign-voice-server.up.railway.app
   ```

   Or via Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add `VOICE_SERVER_URL` = `wss://your-railway-domain.up.railway.app`

3. **Redeploy frontend** (or wait for next push to trigger auto-deploy)

---

## Step 5: Verify Deployment

### Frontend Checks

1. **Visit your production URL**
2. **Test image loading:**
   - Open browser console
   - Check Network tab for image requests
   - Verify images load: `/kb-assets/semantic-space/...`

3. **Test chat functionality:**
   - Send a message
   - Verify agent can retrieve images via `kb_search` and `kb_get`

### Voice Server Checks

1. **Check Railway logs:**
   ```bash
   railway logs
   ```

2. **Test WebSocket connection:**
   - Use browser console or WebSocket client
   - Connect to `wss://your-railway-domain.up.railway.app`
   - Verify connection succeeds

3. **Test voice functionality:**
   - Use voice mode in your app
   - Verify WebSocket connection works

---

## Troubleshooting

### Images Not Loading

1. **Check file paths:**
   - Verify images exist in `public/kb-assets/`
   - Check for spaces in filenames (should be URL-encoded as `%20`)

2. **Check build output:**
   - Images should be in `.next/static/` after build
   - Verify Vercel build logs show images being copied

3. **Check browser console:**
   - Look for 404 errors
   - Verify image paths are correct

### Embeddings Not Working

1. **Verify Qdrant is accessible:**
   ```bash
   # Test Qdrant connection
   curl https://your-qdrant-instance.com/collections
   ```

2. **Re-run embeddings:**
   ```bash
   npm run embed-kb
   ```

3. **Check Qdrant environment variables:**
   - `QDRANT_URL` - Must be set correctly
   - `QDRANT_API_KEY` - If required by your instance

### Voice Server Issues

1. **Check Railway logs:**
   ```bash
   railway logs --tail
   ```

2. **Verify environment variables:**
   ```bash
   railway variables
   ```

3. **Check health endpoint:**
   ```bash
   curl https://your-railway-domain.up.railway.app/health
   ```

### Build Failures

1. **Check build logs:**
   - Vercel: Dashboard → Deployments → View logs
   - Railway: `railway logs`

2. **Common issues:**
   - Missing environment variables
   - Node version mismatch (requires Node 20+)
   - Build timeout (large images can slow builds)

---

## Image Optimization Tips

### Large Images

If you have very large images (>5MB), consider:

1. **Optimize before committing:**
   ```bash
   # Use tools like ImageOptim, Squoosh, or Sharp
   # Compress images while maintaining quality
   ```

2. **Use Next.js Image Optimization:**
   - Consider using Next.js `<Image>` component for automatic optimization
   - Add to `next.config.ts` if needed

3. **CDN for Large Assets:**
   - Consider using a CDN (Cloudflare, Cloudinary) for very large files
   - Update paths in manifest accordingly

---

## Deployment Checklist

- [ ] Images added to `public/kb-assets/`
- [ ] Images committed to git (`git add public/kb-assets/`)
- [ ] Asset manifest updated (`kb/assets/manifest.json`)
- [ ] Embeddings regenerated (`npm run embed-kb`)
- [ ] Frontend environment variables set in Vercel
- [ ] Voice server deployed to Railway
- [ ] Voice server environment variables set
- [ ] Frontend updated with voice server URL
- [ ] Production URLs tested
- [ ] Images loading correctly
- [ ] Chat functionality working
- [ ] Voice functionality working (if applicable)

---

## Quick Reference

### Frontend Deployment
```bash
git push origin main  # Auto-deploys to Vercel
# OR
vercel --prod        # Manual deploy
```

### Voice Server Deployment
```bash
cd voice-server
railway up
```

### Re-run Embeddings
```bash
npm run embed-kb
```

### Check Logs
```bash
# Vercel: Dashboard → Deployments
# Railway:
railway logs
```

---

## Next Steps

- Monitor deployment health
- Set up error tracking (Sentry, etc.)
- Configure custom domain (if needed)
- Set up CI/CD for automated deployments
- Add image optimization pipeline
