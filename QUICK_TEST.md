# Quick Test Guide - Steps 8 & 9

## Prerequisites

1. **Build tool registry:**
   ```bash
   npm run build:tools
   ```
   ✅ Should output: "Tool registry built successfully! Tools: 5"

## Step 8: Test Voice Server

### Option A: Automated Test
```bash
./scripts/Testing/integration/test-integration.sh
```

### Option B: Manual Test
```bash
# Terminal 1: Start voice server
cd voice-server
npm start

# Terminal 2: Test health endpoint
curl http://localhost:8080/health
```

**✅ Success indicators:**
- Console shows: `✓ Tool registry loaded: v1.0.xxx, 5 tools`
- Console shows: `✓ Voice Server listening on port 8080`
- Health endpoint returns: `{"status":"ok",...}`
- **NO crashes or "undefined" errors**

## Step 9: Test Text Agent

### Option A: Automated Test
```bash
./scripts/Testing/integration/test-integration.sh
```

### Option B: Manual Test
```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Test API (wait for Next.js to compile)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
```

**✅ Success indicators:**
- Console shows: `✓ Tool registry loaded: v1.0.xxx` (on first API request)
- API responds (even if error about missing API key)
- **NO "ignoreUserTool is not defined" errors**
- **NO "startVoiceSessionTool is not defined" errors**

## Quick Verification

Check both servers start without these errors:
- ❌ `ReferenceError: ignoreUserTool is not defined`
- ❌ `ReferenceError: startVoiceSessionTool is not defined`
- ❌ `TypeError: Cannot read property 'get' of undefined`
- ❌ `Error: Tool registry not loaded`

## If Tests Fail

1. **Registry not found:**
   ```bash
   npm run build:tools
   ```

2. **Port already in use:**
   ```bash
   # Kill processes on ports
   lsof -ti:8080 | xargs kill -9 2>/dev/null
   lsof -ti:3000 | xargs kill -9 2>/dev/null
   ```

3. **Import errors:**
   - Check `tsconfig.json` has path alias: `"@/tools/*": ["./tools/*"]`
   - Check `voice-server/server.js` imports use correct paths

## Full Details

See `TESTING_GUIDE.md` for comprehensive testing instructions.
