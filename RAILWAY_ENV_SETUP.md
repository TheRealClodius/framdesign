# Railway Environment Variables Setup

## Issue
The server is failing health checks because required environment variables are not set.

## Required Environment Variables

You need to set **at least one** of these credential options:

### Option 1: Google AI Studio (Simpler, but Live API not available)
```bash
railway variables set GEMINI_API_KEY="your-api-key-here"
```

### Option 2: Vertex AI (Required for Live API)
```bash
railway variables set VERTEXAI_PROJECT="your-gcp-project-id"
railway variables set VERTEXAI_LOCATION="us-central1"
```

If using Vertex AI, you also need authentication. Choose one:

**A. Service Account JSON (Recommended for Railway):**
```bash
railway variables set GOOGLE_APPLICATION_CREDENTIALS='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'
```

**B. Application Default Credentials (ADC) - Not recommended for Railway**
This requires gcloud CLI, which isn't available in Railway containers.

### Required: ALLOWED_ORIGINS
```bash
railway variables set ALLOWED_ORIGINS="https://your-production-domain.com,https://www.your-domain.com"
```

## How to Set Variables

### Using Railway CLI:
```bash
cd voice-server
railway variables set GEMINI_API_KEY="your-key"
railway variables set ALLOWED_ORIGINS="https://your-domain.com"
```

### Using Railway Dashboard:
1. Go to https://railway.app
2. Select your project: **FRAMDESIGN-LIVEAPI**
3. Select your service (voice server)
4. Go to **Variables** tab
5. Add each variable:
   - `GEMINI_API_KEY` = your API key
   - `ALLOWED_ORIGINS` = your allowed origins (comma-separated, no spaces)
   - `VERTEXAI_PROJECT` = your GCP project ID (if using Vertex AI)
   - `VERTEXAI_LOCATION` = us-central1 (if using Vertex AI)
   - `GOOGLE_APPLICATION_CREDENTIALS` = your service account JSON (if using Vertex AI)

## Verify Variables Are Set

```bash
railway variables
```

## After Setting Variables

1. **Redeploy:**
   ```bash
   railway up
   ```

2. **Check logs:**
   ```bash
   railway logs
   ```

3. **Look for:**
   - `[ENV] Environment variables check:` - Should show variables as SET
   - `[STARTUP] ✓ Voice Server listening on port` - Server started successfully
   - No `[ERROR] Missing required credentials!` message

## Troubleshooting

### Server still failing?
1. Check Railway logs: `railway logs`
2. Look for `[ERROR]` messages
3. Verify variables are set: `railway variables`
4. Make sure variable names are exact (case-sensitive)
5. For ALLOWED_ORIGINS, use comma-separated values with NO SPACES:
   - ✅ Correct: `https://domain1.com,https://domain2.com`
   - ❌ Wrong: `https://domain1.com, https://domain2.com`

### Getting "Authentication failed"?
- If using Vertex AI, verify your service account JSON is valid
- Check that the service account has the necessary permissions
- Ensure VERTEXAI_PROJECT matches the project in your service account
