# Railway Root Directory Configuration

## Important: Deploy from Project Root

The voice server imports shared tools from `../tools/_core/`, which means Railway must deploy from the **project root**, not from the `voice-server` directory.

## How to Configure

### Option 1: Re-link Railway from Project Root (Recommended)

1. Go to Railway Dashboard → Your Voice Server Project
2. Go to Settings → Delete the current service (or create a new one)
3. From your **project root** (not voice-server), run:
   ```bash
   railway link
   ```
4. Select your voice server project
5. In Railway Dashboard → Settings → Root Directory: Leave empty (defaults to project root)
6. In Railway Dashboard → Settings → Start Command: `cd voice-server && npm start`

### Option 2: Configure Existing Service

1. Go to Railway Dashboard → Your Voice Server Project → Settings
2. Set **Root Directory** to: `/` (project root)
3. Set **Start Command** to: `cd voice-server && npm start`
4. Set **Watch Path** to: `voice-server/**` (optional, to only redeploy on voice-server changes)

## Verification

After configuration, Railway should:
- Deploy from project root (has access to `tools/` directory)
- Run from `voice-server/` directory
- Be able to import `../tools/_core/registry.js` successfully

## Current Import Paths

The server.js uses these paths (relative to voice-server directory):
- `../tools/_core/registry.js` ✅
- `../tools/_core/state-controller.js` ✅
- `../tools/_core/error-types.js` ✅
- `../tools/_core/retry-handler.js` ✅

These paths are correct and will work once Railway is configured to deploy from project root.
