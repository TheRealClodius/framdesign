# Integration Testing Scripts

This directory contains scripts for integration testing of the tool registry and server startup.

## Integration Test Script

**File**: `test-integration.sh`

Automated integration test script that verifies:
- Tool registry builds correctly
- Voice server starts with registry loaded
- Text agent (Next.js) starts with registry loaded
- Health endpoints respond correctly

### Usage

```bash
./scripts/Testing/integration/test-integration.sh
```

Or from the project root:

```bash
chmod +x scripts/Testing/integration/test-integration.sh
scripts/Testing/integration/test-integration.sh
```

### Prerequisites

- Node.js and npm installed
- Dependencies installed (`npm install`)
- Voice server dependencies installed (`cd voice-server && npm install`)
- Ports 8080 and 3000 available (or script will kill existing processes)

### What It Tests

1. **Tool Registry Build**
   - Runs `npm run build:tools`
   - Verifies registry JSON is generated

2. **Voice Server Startup (Step 8)**
   - Starts voice server on port 8080
   - Verifies registry loads successfully
   - Tests health endpoint (`/health`)
   - Checks for registry loading messages in logs

3. **Text Agent Startup (Step 9)**
   - Starts Next.js dev server on port 3000
   - Tests API endpoint (`/api/chat`)
   - Verifies registry loads in text agent
   - Checks for registry loading messages in logs

### Output

The script provides colored output:
- ✅ Green checkmarks for passed tests
- ❌ Red X for failed tests
- ⚠️ Yellow warnings for port conflicts

### Logs

Temporary log files are created:
- `/tmp/tool-build.log` - Tool registry build output
- `/tmp/voice-server.log` - Voice server logs
- `/tmp/nextjs.log` - Next.js logs
- `/tmp/health-response.json` - Health endpoint response
- `/tmp/api-response.json` - API endpoint response

### Related Documentation

- [Testing Guide](../../../TESTING_GUIDE.md)
- [Quick Test Guide](../../../QUICK_TEST.md)
- [Tool Registry Documentation](../../../tools/README.md)
