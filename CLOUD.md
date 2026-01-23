# CLOUD.md - Testing Guide for Cloud Agents

This document provides instructions for cloud agents (automated AI coding assistants) that make changes to the codebase. It ensures tests are run appropriately to validate changes before committing.

## Prerequisites

### Node.js Version

- **Required:** Node.js 22.x (specified in `package.json` engines)
- Check version: `node --version`
- If using nvm: `nvm use` (uses `.nvmrc`)

### Dependencies

- Install dependencies: `npm install`
- Ensure Jest and test dependencies are installed (included in `devDependencies`)

### Environment Variables

Tests use the **same environment variables as the deployment**. The test setup (`tests/setup.ts`) loads variables from:
- `.env` in the project root (for main application tests)
- `.env` in the `voice-server/` folder (for voice server, if applicable)

No special configuration is needed - if the app runs, the tests will have access to the same credentials.

---

## Validation Steps (Required Order)

Cloud agents must run these steps **in order** before committing:

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Lint (REQUIRED - Must Pass)

```bash
npm run lint
```

Linting must pass before proceeding. Fix any lint errors before continuing.

### Step 3: Build Tool Registry (REQUIRED)

```bash
npm run build:tools
```

This generates `tools/tool_registry.json` which is required by many tests.

### Step 4: Run Tests with JSON Output

```bash
npm test -- --json --outputFile=test-results.json
```

Use JSON output for programmatic parsing of results.

### Step 5: Build Verification (REQUIRED - Must Pass)

```bash
npm run build
```

The build must succeed before committing. This validates TypeScript compilation and Next.js build.

---

## Limitations

### Voice Server Testing

**The voice-server component cannot be automatically tested.** It requires:

- WebSocket connections
- Real-time audio streaming
- Gemini Live API access

Manual testing is required for voice-server changes. Cloud agents should:

- Skip automated tests for `voice-server/` changes
- Note in commit message that manual voice testing is needed
- Reference `voice-server/README.md` for manual testing procedures

---

## Smart Test Targeting

Run tests based on which files changed. This improves efficiency while ensuring relevant coverage.

### File-to-Test Mapping

| Changed Files | Tests to Run |
|---------------|--------------|
| `tools/**/*.js`, `tools/**/*.json` | `npm test tests/tools/` |
| `tools/_core/**` | `npm test tests/tools/_core/` |
| `app/api/chat/**` | `npm test tests/integration.test.ts tests/e2e/text-agent*` |
| `lib/services/**` | `npm test tests/services/` |
| `lib/*.ts` | `npm test tests/` (all tests) |
| `app/**/*.tsx`, `components/**` | `npm run build` (build check only) |
| `kb/**/*.md` | No tests needed (content only) |
| `prompts/**/*.md` | No tests needed (content only) |
| `docs/**`, `*.md` | No tests needed (documentation only) |
| `voice-server/**` | **Cannot test automatically** - note in commit |

### Test Commands by Scope

**Minimal (quick validation):**

```bash
npm test tests/tools/_core/registry.test.js -- --json
```

**Tool changes:**

```bash
npm test tests/tools/ -- --json
```

**API/Service changes:**

```bash
npm test tests/e2e/ tests/services/ -- --json
```

**Full suite (major changes):**

```bash
npm test -- --json --outputFile=test-results.json
```

---

## Test Categories

### 1. Unit Tests (`tests/tools/_core/`)

- `registry.test.js` - Tool registry functionality
- `error-types.test.js` - Error handling
- `tool-response.test.js` - Response validation
- `state-controller.test.js` - State management
- `loop-detector.test.js` - Loop detection
- `metrics.test.js` - Metrics and observability

### 2. Integration Tests (`tests/e2e/`)

- `kb-tools-agent-integration.test.js` - Knowledge base tools
- `text-agent-tool-integration.test.js` - Text mode integration
- `tool-execution-text.test.js` - Text tool execution
- `error-scenarios.test.js` - Error handling
- `loop-detection-integration.test.js` - Loop detection E2E

### 3. Service Tests (`tests/services/`)

- `blob-storage-service.test.ts` - Blob storage service

### 4. Feature Tests (`tests/`)

- `message-windowing.test.ts` - Message windowing logic
- `token-estimation.test.ts` - Token counting
- `conversation-hash.test.ts` - Conversation hashing
- `summarization-logic.test.ts` - Summarization logic
- `cache-management.test.ts` - Cache management
- `integration.test.ts` - End-to-end flow

---

## Critical vs Non-Critical Tests

### Critical Tests (Must Pass)

These tests must pass. If they fail, **stop and fix before committing**.

| Test | Command | When Required |
|------|---------|---------------|
| Lint | `npm run lint` | Always |
| Tool Registry Build | `npm run build:tools` | Always |
| Core Registry | `npm test tests/tools/_core/registry.test.js` | Tool changes |
| Error Types | `npm test tests/tools/_core/error-types.test.js` | Error handling changes |
| Build | `npm run build` | Always |

### Non-Critical Tests (Warn on Failure)

These tests can fail but should be reported in commit message:

- `tests/e2e/performance.test.js` - Performance benchmarks (environment-dependent)
- Tests that timeout due to external service availability

---

## Complete Workflow

### Full Validation Sequence

```bash
# 1. Install dependencies
npm install

# 2. Lint (MUST PASS)
npm run lint

# 3. Build tool registry (MUST PASS)
npm run build:tools

# 4. Run targeted tests based on changes (see Smart Test Targeting)
npm test <relevant-tests> -- --json --outputFile=test-results.json

# 5. Build verification (MUST PASS)
npm run build

# 6. If all pass, commit with proper message
```

### Parsing Test Results

The `--json` flag outputs structured results. Key fields:

```json
{
  "success": true,
  "numPassedTests": 45,
  "numFailedTests": 0,
  "numTotalTests": 45,
  "testResults": [...]
}
```

- Check `success` field for overall pass/fail
- Check `numFailedTests` for failure count
- Review `testResults` array for specific failures

---

## Troubleshooting

### Common Issues

#### 1. "Cannot find module" errors

**Solution:** Ensure `npm install` has been run and `node_modules` exists.

#### 2. Tool registry not found

**Solution:** Run `npm run build:tools` before tests.

#### 3. Environment variable errors

**Solution:**

- Check `tests/setup.ts` loads `.env.local` or `.env`
- For cloud environments, ensure variables are set in CI/CD config
- Some tests may be skipped if variables are missing (this is acceptable)

#### 4. Jest VM modules error

**Solution:** The `NODE_OPTIONS='--experimental-vm-modules'` flag is already set in `package.json` test script. Ensure it's being used.

#### 5. Tests timeout

**Solution:**

- Some integration tests may take longer
- Check if external services (Qdrant, GCS) are accessible
- Consider increasing timeout in `jest.config.cjs` if needed

### Test-Specific Issues

#### Tool Registry Tests Failing

- Verify `tools/tool_registry.json` exists and is valid JSON
- Check that `npm run build:tools` completed successfully
- Review `tools/_build/tool-builder.js` for build errors

#### Integration Tests Failing

- Check if external services are available
- Verify environment variables are set
- Some tests may be skipped if services unavailable (acceptable)

---

## Commit Message Guidelines

After tests pass, use this commit message format:

### Standard Commit

```
<type>(<scope>): <description>

<body - what changed and why>

Tests: all passing
```

### With Non-Critical Warnings

```
<type>(<scope>): <description>

<body>

Tests: passing (1 warning: performance.test.js timeout)
```

### Voice Server Changes (Manual Testing Required)

```
<type>(voice-server): <description>

<body>

Tests: automated tests N/A - manual voice testing required
See: voice-server/README.md for testing procedures
```

### Commit Types

- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code refactoring
- `docs` - Documentation only
- `test` - Adding/updating tests
- `chore` - Maintenance tasks

### Scope Examples

- `tools` - Tool system changes
- `api` - API route changes
- `lib` - Library/service changes
- `voice-server` - Voice server changes
- `kb` - Knowledge base changes

---

## Best Practices for Cloud Agents

1. **Follow the order:** Lint → Build Tools → Test → Build → Commit
2. **Use smart targeting:** Run relevant tests based on changed files
3. **Parse JSON output:** Use `--json` flag for programmatic result checking
4. **Report appropriately:**
   - Critical failures → Stop and report
   - Non-critical failures → Note in commit message
5. **Voice server awareness:** Cannot test automatically, note in commit
6. **Skip tests only for:** Documentation-only changes (`.md` files in `docs/`, `kb/`)

---

## Quick Reference

### Complete Workflow (Copy-Paste Ready)

```bash
# Full validation workflow
npm install
npm run lint
npm run build:tools
npm test -- --json --outputFile=test-results.json
npm run build
```

### Targeted Testing by Change Type

```bash
# Tool changes
npm run lint && npm run build:tools && npm test tests/tools/ -- --json

# API changes
npm run lint && npm run build:tools && npm test tests/e2e/ -- --json && npm run build

# Service changes
npm run lint && npm run build:tools && npm test tests/services/ -- --json && npm run build

# Documentation only (no tests needed)
npm run lint
```

### Check Test Results

```bash
# View summary from JSON output
cat test-results.json | jq '{success, passed: .numPassedTests, failed: .numFailedTests}'
```

---

## Decision Tree

```
Changed files?
├── docs/*.md, kb/*.md, prompts/*.md
│   └── Skip tests, lint only
├── voice-server/**
│   └── Note: "manual testing required" in commit
├── tools/**
│   └── Run: lint → build:tools → tests/tools/ → build
├── app/api/**, lib/**
│   └── Run: lint → build:tools → tests/e2e/ → build
└── Other code changes
    └── Run: full workflow
```

---

## Related Documentation

- [tests/README.md](tests/README.md) - Test documentation
- [tests/TEST_SUMMARY.md](tests/TEST_SUMMARY.md) - Test coverage details
- [tools/ARCHITECTURE.md](tools/ARCHITECTURE.md) - Tool system design
- [voice-server/README.md](voice-server/README.md) - Voice server manual testing
