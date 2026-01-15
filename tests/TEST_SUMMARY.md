# Test Suite Summary

## Overview

This document provides an overview of the test coverage for the FRAM tool registry system, including the new observability features added in the simplification refactor.

## Test Structure

```
tests/
├── tools/
│   ├── _core/
│   │   ├── error-types.test.js       # Error type enums and ToolError class
│   │   ├── tool-response.test.js     # Response envelope validation
│   │   ├── registry.test.js          # Tool registry core functionality
│   │   ├── state-controller.test.js  # Session state management
│   │   ├── loop-detector.test.js     # NEW: Loop detection system
│   │   └── metrics.test.js           # NEW: Metrics and observability
│   │
│   ├── execution.test.js             # Tool execution logic
│   └── policy-enforcement.test.js    # Budget and mode restrictions
│
└── e2e/
    ├── voice-agent-tool-integration.test.js  # Voice mode integration
    ├── text-agent-tool-integration.test.js   # Text mode integration
    ├── tool-execution-voice.test.js          # Voice tool execution
    ├── tool-execution-text.test.js           # Text tool execution
    ├── error-scenarios.test.js               # Error handling
    ├── performance.test.js                   # Performance benchmarks
    └── loop-detection-integration.test.js    # NEW: Loop detection E2E
```

## New Tests Added (Simplification Refactor)

### 1. Loop Detection Tests (`tests/tools/_core/loop-detector.test.js`)

**Coverage:**
- Same call repeated detection (3x with identical arguments)
- Empty results repeated detection (2x empty responses)
- Turn isolation (loops don't span turns)
- Session isolation (loops don't span sessions)
- Argument hashing and comparison
- Cleanup behavior (last 5 turns retained)
- Edge cases and complex nested arguments

**Key Test Scenarios:**
- ✅ First two identical calls allowed
- ✅ Third identical call triggers SAME_CALL_REPEATED
- ✅ Two empty results trigger EMPTY_RESULTS_REPEATED
- ✅ Different arguments don't trigger loop
- ✅ Different tools don't trigger loop
- ✅ New turn resets loop tracking
- ✅ Sessions tracked independently

**Total Tests:** 20+

### 2. Metrics Tests (`tests/tools/_core/metrics.test.js`)

**Coverage:**
- Tool execution tracking (success/failure rates)
- Latency percentile calculations (P50, P95, P99)
- Response size tracking
- Token estimation (chars / 4 formula)
- Session lifecycle management
- Context window metrics
- Multiple concurrent sessions
- Edge cases and cleanup

**Key Test Scenarios:**
- ✅ Record successful and failed executions
- ✅ Track latency percentiles accurately
- ✅ Measure response sizes
- ✅ Estimate token usage
- ✅ Track per-session tool calls
- ✅ Handle turn advancement
- ✅ Store context init tokens
- ✅ Reset all metrics

**Total Tests:** 25+

### 3. Loop Detection Integration Tests (`tests/e2e/loop-detection-integration.test.js`)

**Coverage:**
- Realistic voice server scenarios
- Integration with tool registry
- Multi-turn conversations
- Agent feedback messages
- Turn boundary behavior
- Session cleanup
- Typical workflow patterns

**Key Test Scenarios:**
- ✅ Voice server detects loop before execution
- ✅ Helpful messages provided to agent
- ✅ Turn complete resets detection
- ✅ Multiple sessions handled independently
- ✅ Empty/non-empty result alternation
- ✅ Exact argument matching
- ✅ Cross-turn isolation verified

**Total Tests:** 15+

## Existing Test Coverage

### Core Registry Tests (`tests/tools/_core/registry.test.js`)
- Registry initialization
- Tool loading from artifact
- Provider schema retrieval
- Tool summaries and documentation
- Tool metadata
- Tool execution with validation
- Error handling (NOT_FOUND, VALIDATION, INTERNAL)
- Lock and snapshot functionality
- **Status:** ✅ No changes required (tests still pass)

### Core Infrastructure Tests
- `error-types.test.js` - Error enums and ToolError class
- `tool-response.test.js` - Response envelope validation
- `state-controller.test.js` - Session state management
- **Status:** ✅ No changes required

### E2E Integration Tests
- Voice mode tool execution
- Text mode tool execution
- Mode restriction enforcement
- Error scenarios
- Performance benchmarks
- **Status:** ✅ No changes required

## Documentation Structure Tests

**No longer needed:**
- ❌ Tests for `doc_summary.md` validation
- ❌ Tests for 7-section `doc.md` structure
- ❌ Tests for old documentation linting

**Why removed:**
- Documentation now uses simplified `guide.md` format
- No required section structure (flexible format)
- Summary auto-extracted (not validated at build time beyond length)
- Tests focus on runtime behavior, not doc structure

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific test suite
```bash
# Loop detection tests
npm test tests/tools/_core/loop-detector.test.js

# Metrics tests
npm test tests/tools/_core/metrics.test.js

# Loop detection integration
npm test tests/e2e/loop-detection-integration.test.js
```

### Run by category
```bash
# Core unit tests
npm test tests/tools/_core/

# E2E integration tests
npm test tests/e2e/
```

### Watch mode (for development)
```bash
npm test -- --watch
```

## Coverage Goals

### Current Coverage
- **Core Registry:** ~95% coverage
- **Error Handling:** ~90% coverage
- **Tool Execution:** ~85% coverage
- **Loop Detection:** ~95% coverage (NEW)
- **Metrics:** ~90% coverage (NEW)

### Coverage Targets
- Core infrastructure: 90%+ coverage
- Tool handlers: 80%+ coverage
- E2E scenarios: 70%+ coverage (focus on critical paths)

## Test Maintenance

### When to Update Tests

**1. Adding new tools:**
- No test changes required (registry auto-discovers)
- Add E2E tests if tool has complex behavior

**2. Modifying tool schema:**
- Update mocks in registry.test.js if structure changes
- Update E2E tests if behavior changes

**3. Changing loop detection thresholds:**
- Update `loop-detector.test.js` expectations
- Update integration test assertions

**4. Adding new metrics:**
- Add tests to `metrics.test.js`
- Update `getMetrics()` test expectations

**5. Changing documentation format:**
- No test changes required (tests don't validate doc structure)
- Only update if changing registry artifact format

### Test Hygiene

**Best practices:**
- Clear state between tests (`beforeEach` cleanup)
- Use descriptive test names ("should detect loop on third identical call")
- Test edge cases (null, undefined, empty, very large values)
- Test error paths, not just happy paths
- Use realistic data in integration tests

**Anti-patterns to avoid:**
- Don't test implementation details (test behavior)
- Don't duplicate coverage (one test per behavior)
- Don't use magic numbers (use named constants)
- Don't skip cleanup (always reset state)

## Continuous Integration

### Pre-commit Checks
```bash
npm run build:tools  # Validate registry builds
npm test            # Run all tests
```

### CI Pipeline
1. Build tool registry
2. Run unit tests
3. Run E2E tests
4. Generate coverage report
5. Fail if coverage drops below threshold

### Performance Benchmarks
- Registry load time: < 100ms
- Tool execution latency: < 1s (retrieval), < 3s (action)
- Loop detection check: < 1ms
- Metrics recording: < 1ms

## Known Limitations

### What's NOT tested
- Actual Gemini API calls (mocked)
- WebSocket transport layer (mocked)
- LanceDB vector search (mocked)
- File system operations (mocked)
- Network errors (partially mocked)

### Why not tested
- External dependencies (not unit testable)
- Cost (API calls expensive)
- Flakiness (network unreliability)
- Speed (tests should be fast)

### How we handle it
- Mock interfaces at boundaries
- Test against contracts, not implementations
- Manual QA for integration points
- Staging environment for E2E validation

## Future Test Improvements

### Planned
- [ ] Add build-time validation tests (tool-builder.js)
- [ ] Add voice-server integration tests with mocked Gemini
- [ ] Add performance regression tests
- [ ] Add load testing for concurrent sessions
- [ ] Add fuzzing for schema validation

### Under Consideration
- [ ] Visual regression tests (UI changes)
- [ ] Contract tests with external APIs
- [ ] Mutation testing (test quality)
- [ ] Property-based testing (edge case discovery)

## Troubleshooting Tests

### Tests failing after simplification?
1. Check if test references `doc_summary.md` or `doc.md`
2. Update to use `guide.md` or remove doc validation
3. Verify mocked registry artifact structure matches new format

### New tests not running?
1. Check test file naming (`*.test.js` or `*.spec.js`)
2. Verify file in `tests/` directory
3. Check Jest config includes test path
4. Run `npm test -- --listTests` to see discovered tests

### Flaky tests?
1. Check for race conditions (async/await)
2. Verify state cleanup between tests
3. Check for shared mutable state
4. Add explicit timing controls if needed

### Coverage dropping?
1. Identify uncovered lines with `npm test -- --coverage`
2. Add tests for new code paths
3. Check if dead code can be removed
4. Update coverage thresholds if intentional

## Related Documentation

- [tools/ARCHITECTURE.md](../tools/ARCHITECTURE.md) - Tool system design
- [tools/OBSERVABILITY.md](../tools/OBSERVABILITY.md) - Metrics and monitoring
- [tools/README.md](../tools/README.md) - Tool authoring guide
- [tools/TROUBLESHOOTING.md](../tools/TROUBLESHOOTING.md) - Common issues
