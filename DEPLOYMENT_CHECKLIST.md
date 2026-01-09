# Railway Deployment Checklist

Use this checklist to ensure a smooth deployment to Railway.

## Pre-Deployment

### Voice Server

- [ ] Railway account created
- [ ] Railway CLI installed (`npm install -g @railway/cli`)
- [ ] Google Cloud Project created (for Vertex AI) OR Google AI Studio API key obtained
- [ ] Vertex AI API enabled (if using Vertex AI)
- [ ] Service account created and authenticated (if using Vertex AI)
- [ ] Production domain(s) identified
- [ ] `.env.example` reviewed and understood

### Next.js Application

- [ ] Google Analytics 4 property created
- [ ] Resend account created and API key obtained
- [ ] Google Generative AI API key obtained
- [ ] OpenAI API key obtained
- [ ] Production domain identified
- [ ] `.env.example` reviewed and understood

## Deployment Steps

### Voice Server Deployment

- [ ] Navigated to `voice-server` directory
- [ ] Logged into Railway (`railway login`)
- [ ] Initialized Railway project (`railway init`)
  - [ ] Named project: `FRAM-WEBSITE-G-LIVE-API`
- [ ] Linked to Railway project (`railway link`)
- [ ] Set environment variables:
  - [ ] `VERTEXAI_PROJECT` and `VERTEXAI_LOCATION` (if using Vertex AI), OR
  - [ ] `GEMINI_API_KEY` (if using AI Studio)
  - [ ] `ALLOWED_ORIGINS` (includes localhost and production domain)
- [ ] Verified environment variables (`railway variables`)
- [ ] Deployed service (`railway up`)
- [ ] Obtained Railway domain (`railway domain`)
- [ ] Tested health endpoint (`curl https://your-domain.up.railway.app/health`)
- [ ] Verified logs (`railway logs`)

### Next.js Application Deployment

- [ ] Navigated to project root directory
- [ ] Logged into Railway (`railway login`)
- [ ] Initialized Railway project (`railway init`)
  - [ ] Named project: `FRAM-WEBSITE` (or preferred name)
- [ ] Linked to Railway project (`railway link`)
- [ ] Set environment variables:
  - [ ] `NEXT_PUBLIC_GA_MEASUREMENT_ID`
  - [ ] `RESEND_API_KEY`
  - [ ] `GOOGLE_GENAI_API_KEY`
  - [ ] `OPENAI_API_KEY`
  - [ ] `NEXT_PUBLIC_VOICE_SERVER_URL` (from Voice Server deployment)
- [ ] Verified environment variables (`railway variables`)
- [ ] Verified build settings in Railway dashboard:
  - [ ] Build Command: `npm run build`
  - [ ] Start Command: `npm start`
  - [ ] Root Directory: `/`
- [ ] Deployed application (`railway up`)
- [ ] Obtained Railway domain (`railway domain`)
- [ ] Tested application in browser

## Post-Deployment

### Configuration Updates

- [ ] Updated Voice Server `ALLOWED_ORIGINS` to include Next.js app domain
- [ ] Verified Voice Server WebSocket URL is correct in Next.js environment variables
- [ ] Redeployed Voice Server (if `ALLOWED_ORIGINS` was updated)

### Testing

- [ ] Homepage loads correctly
- [ ] Chat interface works
- [ ] Voice functionality connects to Voice Server
- [ ] Voice conversation works end-to-end
- [ ] Contact form submits successfully
- [ ] Email notifications work (if applicable)
- [ ] Analytics tracking works
- [ ] All pages load without errors
- [ ] Mobile responsiveness verified

### Custom Domain (Optional)

- [ ] Generated Railway domain or added custom domain
- [ ] Configured DNS records (if custom domain)
- [ ] Verified SSL certificate is active
- [ ] Updated `ALLOWED_ORIGINS` with custom domain
- [ ] Tested application with custom domain

### Monitoring Setup

- [ ] Verified logs are accessible
- [ ] Set up log monitoring (if desired)
- [ ] Verified metrics are visible in Railway dashboard
- [ ] Set up alerts (if desired)

## Security Verification

- [ ] No API keys committed to repository
- [ ] All secrets stored in Railway variables only
- [ ] `.env` files in `.gitignore`
- [ ] `ALLOWED_ORIGINS` restricted to actual domains
- [ ] Railway account has 2FA enabled (recommended)
- [ ] Reviewed Railway security settings

## Documentation

- [ ] Production URLs documented
- [ ] Environment variables documented
- [ ] Deployment process documented
- [ ] Team members informed of deployment

## Troubleshooting (if needed)

- [ ] Checked Railway logs for errors
- [ ] Verified all environment variables are set
- [ ] Tested health endpoints
- [ ] Verified WebSocket connections
- [ ] Checked browser console for errors
- [ ] Verified CORS settings
- [ ] Tested locally to compare behavior

## Completion

- [ ] All checklist items completed
- [ ] Application is live and functional
- [ ] Team notified of successful deployment
- [ ] Monitoring in place
- [ ] Ready for production traffic

---

## Quick Verification Commands

```bash
# Voice Server Health Check
curl https://fram-website-g-live-api.up.railway.app/health

# View Voice Server Logs
cd voice-server && railway logs

# View Next.js App Logs
railway logs

# Check Environment Variables
railway variables

# Get Service URLs
railway domain
```

---

## Rollback Plan (if needed)

If deployment fails:

1. **Voice Server**: Check logs, fix issues, redeploy
2. **Next.js App**: Check logs, fix issues, redeploy
3. **Environment Variables**: Verify all required variables are set
4. **Dependencies**: Ensure `package.json` has all required packages
5. **Build Errors**: Check Node.js version compatibility

If rollback is needed:
- Railway keeps previous deployments
- Can rollback via Railway dashboard → Deployments → Select previous deployment

---

**Last Updated**: [Date]
**Deployed By**: [Name]
**Production URLs**:
- Voice Server: `wss://fram-website-g-live-api.up.railway.app`
- Next.js App: `https://fram-website.up.railway.app`
