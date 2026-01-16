# Tool Registry Integration Testing Guide

This guide covers testing Steps 8 and 9: Voice server and text agent startup with registry integration.

## Prerequisites

1. **Build tool registry first:**
   ```bash
   npm run build:tools
   ```
   This generates `tools/tool_registry.json` which both servers need.

2. **Environment variables:**
   - Voice server: `.env` in `voice-server/` directory
   - Text agent: `.env` in root directory (for `GEMINI_API_KEY`)

## Step 8: Test Voice Server Startup

### Quick Test (Automated)

Run the test script:
```bash
chmod +x scripts/Testing/integration/test-integration.sh
./scripts/Testing/integration/test-integration.sh
```

### Manual Test

1. **Start the voice server:**
   ```bash
   cd voice-server
   npm start
   ```

2. **Expected console output:**
   ```
   Loading tool registry...
  ✓ Tool registry loaded: v1.0.abc123de, 8 tools, git commit: ed2dc22
   Voice Server starting on port 8080
   ✓ Voice Server listening on port 8080
     WebSocket: ws://localhost:8080
     Health check: http://localhost:8080/health
   ```

3. **Verify registry loaded:**
   - ✅ Look for "Tool registry loaded" message
  - ✅ Check tool count is 5 (all directly callable)
   - ✅ No errors about missing tools or undefined variables

4. **Test health endpoint:**
   ```bash
   curl http://localhost:8080/health
   ```
   Should return: `{"status":"ok","timestamp":...}`

5. **Check for crashes:**
   - ✅ Server should stay running
   - ✅ No "ReferenceError: X is not defined" errors
   - ✅ No "Cannot read property of undefined" errors
   - ✅ Line 731 should NOT crash (was using undefined `ignoreUserTool`)

### Common Issues

**Issue: "Tool registry loaded" but no tools**
- **Fix:** Run `npm run build:tools` first
- **Check:** `tools/tool_registry.json` exists and has 8 tools

**Issue: "Cannot find module '@/tools/_core/registry'**
- **Fix:** Check `tsconfig.json` has path alias: `"@/tools/*": ["./tools/*"]`
- **Note:** Voice server uses ES modules, so this shouldn't apply

**Issue: Server crashes at line 731**
- **Fix:** Should be fixed - line 731 now uses `geminiToolSchemas` from registry
- **Verify:** Check `voice-server/server.js` line 767 uses `geminiToolSchemas`

## Step 9: Test Text Agent Startup

### Quick Test (Automated)

The test script covers this too:
```bash
./scripts/Testing/integration/test-integration.sh
```

### Manual Test

1. **Start Next.js dev server:**
   ```bash
   npm run dev
   ```

2. **Expected console output:**
   ```
   ✓ Tool registry loaded: v1.0.abc123de
   ▲ Next.js 16.1.1
   - Local:        http://localhost:3000
   ```

3. **Verify registry loaded:**
   - ✅ Look for "Tool registry loaded" message in console
   - ✅ Check it appears on first API request (not at startup - Next.js loads on demand)

4. **Test API endpoint:**
   ```bash
   curl -X POST http://localhost:3000/api/chat \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"test"}]}'
   ```
   
   Should either:
   - Return a streaming response (if `GEMINI_API_KEY` is set)
   - Return error about missing API key (expected if not configured)
   - **NOT crash** with "Cannot find module" or "undefined is not a function"

5. **Check for errors:**
   - ✅ No "ignoreUserTool is not defined" errors
   - ✅ No "startVoiceSessionTool is not defined" errors
   - ✅ Registry loads successfully on first request

### Common Issues

**Issue: "Cannot find module '@/tools/_core/registry'"**
- **Fix:** Update `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "paths": {
        "@/*": ["./*"],
        "@/tools/*": ["./tools/*"]
      }
    }
  }
  ```

**Issue: "providerSchemas is not defined"**
- **Fix:** Registry must load before `providerSchemas` is used
- **Check:** `app/api/chat/route.ts` loads registry at line ~504

**Issue: Tools not available in Gemini API**
- **Fix:** Check `providerSchemas` is passed to `functionDeclarations`
- **Verify:** All 3 locations (lines 273, 399, 745) use `providerSchemas`

## Verification Checklist

### Voice Server ✅
- [ ] Server starts without crashes
- [ ] Registry loads: "Tool registry loaded: v..."
- [ ] 8 tools loaded in registry (check log)
- [ ] Health endpoint responds
- [ ] No undefined variable errors
- [ ] Line 731 uses `geminiToolSchemas` (not hardcoded tools)

### Text Agent ✅
- [ ] Next.js starts without crashes
- [ ] Registry loads on first API request
- [ ] No "ignoreUserTool is not defined" errors
- [ ] No "startVoiceSessionTool is not defined" errors
- [ ] API endpoint responds (even if with error)
- [ ] All 3 tool locations use `providerSchemas`

## Advanced Testing

### Test Tool Execution

**Voice Server:**
1. Connect WebSocket client
2. Send `{"type":"start"}`
3. Check logs for tool registry version in session state

**Text Agent:**
1. Send chat message
2. Check logs for "tool_execution" structured logs
3. Verify tools are called via registry (not hardcoded)

### Test Tool Exposure

Check that all 5 tools are exposed directly to Gemini:
- `ignore_user`
- `start_voice_session`
- `end_voice_session`
- `kb_search`
- `kb_get`

**Voice Server:** Check `geminiToolSchemas` length in logs (should be 5)

**Text Agent:** Check `providerSchemas.length` in logs (should be 5)

## Troubleshooting

### Registry Not Loading

1. **Check registry file exists:**
   ```bash
   ls -la tools/tool_registry.json
   ```

2. **Rebuild registry:**
   ```bash
   npm run build:tools
   ```

3. **Check registry file is valid JSON:**
   ```bash
   cat tools/tool_registry.json | jq '.tools | length'
   ```
   Should output: `5`

### Import Errors

**Voice Server (ES modules):**
- Uses: `import { toolRegistry } from '../tools/_core/registry.js'`
- Check: Path is correct relative to `voice-server/server.js`

**Text Agent (TypeScript/Next.js):**
- Uses: `import { toolRegistry } from '@/tools/_core/registry'`
- Check: `tsconfig.json` path alias is configured

### State Controller Errors

If you see "state.get is not a function":
- **Fix:** Ensure `createStateController()` is called (not just an object)
- **Check:** State controller is initialized before use

## Success Criteria

✅ **Step 8 Complete When:**
- Voice server starts without crashes
- Registry loads successfully with 5 tools
- All 5 tools are directly exposed to Gemini
- Health endpoint works
- No undefined variable errors

✅ **Step 9 Complete When:**
- Next.js starts without crashes
- Registry loads on first API request
- No hardcoded tool errors
- API endpoint responds
- All tool locations use registry

## Next Steps

After successful testing:
1. Test actual tool execution (ignore_user, start_voice_session)
2. Test KB tools (kb_search, kb_get)
3. Test voice mode tool calls
4. Test budget enforcement in voice mode
