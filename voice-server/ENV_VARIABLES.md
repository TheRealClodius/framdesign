# Environment Variables Reference

This document describes all environment variables used by the FRAM Voice Server.

## Required Variables

**IMPORTANT**: Live API requires **Vertex AI** credentials. Google AI Studio API keys do NOT work with Live API.

### `VERTEXAI_API_KEY` (Preferred for Live API)

**Type:** String  
**Required:** Yes (for Vertex AI)  
**Description:** Your Vertex AI API key or service account credentials for accessing the Live API.

**How to get:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable Vertex AI API
4. Create service account or API key
5. Copy the credentials

**Example:**
```bash
VERTEXAI_API_KEY=your-vertex-ai-key-here
VERTEXAI_PROJECT=your-gcp-project-id
VERTEXAI_LOCATION=us-central1
```

---

### `GEMINI_API_KEY` (Legacy - AI Studio)

**Type:** String  
**Required:** Only if not using Vertex AI  
**Description:** Your Google AI Studio API key. **Note: This does NOT work with Live API**, only with standard text chat.

**How to get:**
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key or use an existing one
3. Copy the key (starts with `AIza...`)

**Example:**
```bash
GEMINI_API_KEY=AIzaSyExample1234567890abcdefghijklmnop
```

**Security:** Never commit this to version control. Always use Railway environment variables or `.env` file (which should be in `.gitignore`).

---

### `ALLOWED_ORIGINS`

**Type:** String (comma-separated)  
**Required:** Yes (has default for localhost)  
**Description:** Comma-separated list of allowed WebSocket origins for CORS validation.

**Format:** No spaces after commas, include protocol (`http://` or `https://`)

**Default:** `http://localhost:3000` (if not set)

**Examples:**

Local development only:
```bash
ALLOWED_ORIGINS=http://localhost:3000
```

Development + Production:
```bash
ALLOWED_ORIGINS=http://localhost:3000,https://framdesign.com
```

Multiple production domains:
```bash
ALLOWED_ORIGINS=https://framdesign.com,https://www.framdesign.com,https://staging.framdesign.com
```

**Security:** Only include domains you control. This prevents unauthorized websites from connecting to your voice server.

---

## Optional Variables

### `PORT`

**Type:** Number  
**Required:** No  
**Description:** Port number for the HTTP/WebSocket server.

**Default:** `8080`

**Example:**
```bash
PORT=8080
```

**Railway Note:** Railway automatically sets `PORT` when deploying. Don't override it unless you have a specific reason.

---

## Local Development Setup

Create a `.env` file in the `voice-server` directory:

```env
GEMINI_API_KEY=your-gemini-api-key-here
PORT=8080
ALLOWED_ORIGINS=http://localhost:3000
```

**Important:** Add `.env` to `.gitignore` to prevent committing secrets.

---

## Railway Deployment Setup

Set variables using Railway CLI:

```bash
railway variables set GEMINI_API_KEY="your-api-key-here"
railway variables set ALLOWED_ORIGINS="http://localhost:3000,https://your-production-domain.com"
```

Or set them in the Railway dashboard:
1. Go to your Railway project
2. Navigate to **Variables** tab
3. Click **New Variable**
4. Add each variable

---

## Verification

After setting environment variables, verify they're loaded:

**Local:**
```bash
# Check .env file exists and has correct values
cat .env
```

**Railway:**
```bash
# List all variables
railway variables

# Check specific variable (value will be hidden)
railway variables get GEMINI_API_KEY
```

---

## Troubleshooting

### Server exits immediately

**Problem:** Server starts then immediately exits with error about `GEMINI_API_KEY`.

**Solution:** Ensure `GEMINI_API_KEY` is set:
- Local: Check `.env` file exists and has the variable
- Railway: Run `railway variables` to verify

### WebSocket connection rejected

**Problem:** Browser shows "Unauthorized origin" error.

**Solution:** Add your domain to `ALLOWED_ORIGINS`:
- Include the exact protocol (`http://` or `https://`)
- Include the exact domain (no trailing slash)
- Separate multiple domains with commas (no spaces)

### Port already in use

**Problem:** Server fails to start with "EADDRINUSE" error.

**Solution:** Change `PORT` to an available port, or stop the process using port 8080.

---

## Security Best Practices

1. **Never commit API keys** to version control
2. **Use Railway variables** for production secrets
3. **Restrict ALLOWED_ORIGINS** to only your domains
4. **Rotate API keys** periodically
5. **Monitor usage** in Google AI Studio dashboard
6. **Use different keys** for development and production if possible
