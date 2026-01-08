# Tests for Conversation Memory Management

This directory contains tests for the conversation memory management system implemented in `app/api/chat/route.ts`.

## Test Files

- **message-windowing.test.ts**: Tests for the 20-message windowing logic
- **token-estimation.test.ts**: Tests for token counting and estimation
- **conversation-hash.test.ts**: Tests for conversation hashing (stability, uniqueness)
- **summarization-logic.test.ts**: Tests for when summaries should be generated/updated
- **cache-management.test.ts**: Tests for cache validity, expiration, and management
- **integration.test.ts**: End-to-end tests for the complete flow

## Running Tests

### Install Dependencies

First, install the test dependencies:

```bash
npm install --save-dev jest @types/jest ts-jest
```

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test message-windowing
npm test token-estimation
npm test conversation-hash
npm test summarization-logic
npm test cache-management
npm test integration
```

### Run Tests in Watch Mode

```bash
npm test -- --watch
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

## Test Coverage

The tests verify:

1. **Message Windowing**: Only last 20 messages are kept as raw history
2. **Token Estimation**: Accurate token counting for context window management
3. **Conversation Hashing**: Stable hashes for same conversations, different hashes for different conversations
4. **Summarization Logic**: Correct timing for summary generation and updates
5. **Cache Management**: Proper cache creation, validation, and expiration
6. **Integration Flow**: Complete end-to-end flow from messages to API context

## Notes

- Tests use mocked functions where appropriate to avoid actual API calls
- Token estimation uses the same formula as production code (1 token ≈ 4 chars)
- Cache TTL is set to 3600 seconds (1 hour) matching production
- MAX_RAW_MESSAGES is set to 20 matching production
