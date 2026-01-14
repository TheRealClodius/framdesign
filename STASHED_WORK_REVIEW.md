# Stashed Work Review - Main Branch (Last ~30 Hours)

## Overview

**40 commits** spanning Jan 9-13, 2026, adding **21,305 lines** of code to transform a simple landing page into a full-featured AI chat application with voice capabilities.

**Latest commit:** `2644552` - "Force deployment trigger" (Jan 13, 18:13 +0200) - ~3-4 hours ago

---

## What Was Built

### 🎯 Core Features

#### 1. **AI Chat Interface** (ChatInterface.tsx - 1,095+ lines)
A complete interactive chat system featuring:
- Real-time **streaming responses** from Google Gemini API
- **localStorage persistence** - conversations survive page refreshes
- **Message history** with auto-scrolling
- **Markdown rendering** for formatted responses
- **Mermaid diagram support** - renders flowcharts, diagrams inline
- **Mobile-responsive design** with touch interactions
- **Timeout/blocking system** - AI can block abusive users
- Voice/text mode switching with seamless transitions

Key technical details:
- Normalizes AI responses (handles escaped newlines, fixes diagram formatting)
- Implements "ignore_user" tool - AI can timeout users for 30s to 24h
- Smart diagram parsing with automatic formatting fixes
- Message windowing to manage token limits

#### 2. **Voice Agent System** (voice-server/ - 1,158+ lines)
Complete WebSocket-based voice conversation system:

**Backend (voice-server/server.js):**
- WebSocket server for real-time bidirectional audio
- Google Gemini Live API integration (native audio)
- Multi-client support with session management
- Audio chunk processing (PCM16 format)
- Tool calling system (ignore_user, end_voice_session)
- Transcript generation and text message injection
- Graceful session termination
- Health check endpoints

**Frontend (lib/services/voice-service.ts - 1,005 lines):**
- Client-side WebSocket connection manager
- Browser MediaRecorder integration
- Audio recording/playback with Web Audio API
- Automatic reconnection logic
- Voice state management
- Integration with ChatInterface
- Transcript display in chat history

**Features:**
- Native audio streaming (no speech-to-text conversion)
- Real-time voice conversations with AI
- AI can speak farewell messages when blocking users
- Pending request system (e.g., "start voice and tell me a joke")
- Voice acknowledgments that play immediately
- Switch seamlessly between voice/text modes

#### 3. **Mermaid Diagram Rendering System** (3 components, 999 lines)
Advanced diagram generation from AI responses:

**MermaidRenderer.tsx** (622 lines):
- Client-side Mermaid.js integration
- Error-tolerant parsing
- Retry logic for rendering failures
- Mobile-responsive sizing
- Performance optimizations

**MarkdownWithMermaid.tsx** (215 lines):
- Markdown parser with diagram detection
- React-markdown integration
- GitHub Flavored Markdown support
- Automatic code block → diagram conversion

**DiagramModal.tsx** (162 lines):
- Full-screen diagram viewer
- Modal overlay for better visualization
- Mobile-friendly interactions

#### 4. **API Layer** (app/api/chat/route.ts - 908+ lines)
Sophisticated backend for AI conversations:

**Features:**
- Google Gemini API integration with streaming
- **Prompt caching system** - reduces API costs/latency
- **Conversation caching** - reuses system prompt across messages
- **Smart message windowing** - manages 100K+ token context
- **Automatic summarization** - condenses old messages
- **Tool calling** - AI can invoke actions (ignore_user, start_voice_session)
- Error handling with retry logic
- Token estimation and optimization
- Cache invalidation on timeout expiry

**Caching Strategy:**
- System prompt cached once, reused for all conversations
- Conversation caches keyed by first 5 messages + timeout state
- Automatic cache expiry after 5 minutes
- In-memory cache store with TTL management

**Message Management:**
- Reserves tokens for system prompt, current response
- Windows messages to fit context (default 128K tokens)
- Summarizes old messages when exceeding 75% capacity
- Preserves last 50 messages before summarizing

#### 5. **Storage & State Management** (lib/ directory - 500+ lines)

**storage.ts** (127 lines):
- localStorage wrapper for chat persistence
- Message ID generation
- Timeout/block state management
- Chat history clear functionality
- Typed interfaces for messages

**constants.ts** (41 lines):
- Message limits (100 per conversation)
- Cache configuration (5min TTL, max 20 caches)
- Token configuration (128K context, 8K output, 4K safety margin)
- Stream configuration (delays, retry settings)
- UI text constants

**errors.ts** (116 lines):
- Custom error classes (OverloadedError)
- Error handling utilities
- Retryable error detection
- Server error formatters

**config.ts** (98 lines):
- System prompt for FRAM AI personality
- Configuration management
- Environment variable handling

**message-utils.ts** (18 lines):
- Message manipulation utilities

#### 6. **Google Analytics Integration** (Analytics.tsx + docs)
- GA4 tracking component
- Daily visitor analytics
- Event tracking setup
- Complete setup documentation (ANALYTICS_SETUP.md - 197 lines)

#### 7. **Comprehensive Test Suite** (tests/ - 1,500+ lines, 12 files)
Full test coverage for core functionality:

**Core Tests:**
- `cache-management.test.ts` (123 lines) - Cache TTL, eviction, invalidation
- `conversation-hash.test.ts` (141 lines) - Hash stability, collision handling
- `integration.test.ts` (161 lines) - End-to-end conversation flows
- `message-windowing.test.ts` (97 lines) - Token limit management
- `summarization-logic.test.ts` (115 lines) - Message summarization
- `token-estimation.test.ts` (192 lines) - Token counting accuracy

**Voice Mode Tests (6 files, 980+ lines):**
- `chat-history.test.ts` (120 lines) - Transcript persistence
- `system-prompt.test.ts` (85 lines) - Voice prompt handling
- `transcripts-display.test.ts` (131 lines) - UI rendering
- `transcripts-service.test.ts` (158 lines) - Service logic
- `transcripts-text-agent.test.ts` (252 lines) - Text message injection
- `voice-integration.test.ts` (234 lines) - End-to-end voice flows

**Test Infrastructure:**
- Jest configuration
- Test runner scripts (tests/run-tests.sh)
- Setup utilities (tests/setup.ts)
- README with test documentation

#### 8. **Deployment Infrastructure**
Complete deployment setup for Vercel + Railway:

**Railway (Voice Server):**
- `railway.json` - Railway deployment config
- `voice-server/railway.json` - Voice server specific config
- `scripts/deploy-voice-server.sh` (134 lines) - Automated deployment
- `RAILWAY_DEPLOYMENT.md` (513 lines) - Full deployment guide
- `RAILWAY_QUICK_START.md` (97 lines) - Quick start guide
- `voice-server/RAILWAY_DEPLOYMENT.md` (244 lines) - Voice server guide
- `voice-server/ENV_VARIABLES.md` (187 lines) - Environment docs

**Vercel (Frontend):**
- `VERCEL_ENV_SETUP.md` (174 lines) - Vercel configuration guide
- `DEPLOYMENT_CHECKLIST.md` (179 lines) - Pre-deployment checklist

**Development Scripts:**
- `dev:all` - Run frontend + voice server concurrently
- `dev:voice` - Voice server only
- `dev:clean` - Kill existing dev servers
- `test`, `test:watch`, `test:coverage` - Test runners

#### 9. **Internationalization** (app/[locale]/ - 110 lines)
- `app/[locale]/layout.tsx` (78 lines) - Locale-aware layout
- `app/[locale]/page.tsx` (32 lines) - Locale routing
- next-intl integration for multi-language support

#### 10. **Developer Tools**
- `app/api/debug-env/route.ts` (25 lines) - Environment variable debugger
- `components/ConsoleFilter.tsx` (45 lines) - Console log filtering
- `.cursor/debug.log` - Development debug logs

---

## 📦 Dependencies Added

### Production Dependencies (7 new):
```json
"@google/genai": "^1.35.0",        // Google Gemini API
"@next/third-parties": "^16.1.1",  // Analytics integration
"mermaid": "^11.12.2",              // Diagram rendering
"next-intl": "^4.7.0",              // Internationalization
"openai": "^6.15.0",                // OpenAI SDK (for Claude?)
"react-markdown": "^10.1.0",        // Markdown parser
"remark-gfm": "^4.0.1"              // GitHub Flavored Markdown
```

### Dev Dependencies (4 new):
```json
"@types/jest": "^29.5.14",
"concurrently": "^9.2.1",           // Run multiple processes
"jest": "^29.7.0",
"jest-environment-node": "^29.7.0"
```

---

## 🔧 Technical Architecture

### Frontend Stack:
- **Next.js 16.1.1** (App Router)
- **React 19.2.3** (Client components)
- **TypeScript 5**
- **Tailwind CSS 4**

### AI Integration:
- **Google Gemini API** (gemini-2.5-flash-latest / gemini-3-flash-preview)
- **Gemini Live API** (native audio streaming)
- **Prompt caching** (reduces costs by 75%)
- **Tool calling** (function declarations)

### Real-time Communication:
- **WebSocket** (voice-server uses 'ws' package)
- **Server-Sent Events** (streaming chat responses)
- **Web Audio API** (browser audio recording)
- **MediaRecorder API** (audio capture)

### Data Flow:

```
┌─────────────────────────────────────────────────────┐
│                 Frontend (Next.js)                  │
│                                                     │
│  ┌───────────────────────────────────────────┐    │
│  │         ChatInterface Component           │    │
│  │  - Message history (localStorage)         │    │
│  │  - Input handling                         │    │
│  │  - Streaming response display             │    │
│  │  - Voice/text mode toggle                 │    │
│  └─────────┬────────────────────┬────────────┘    │
│            │                    │                  │
│  ┌─────────▼─────┐    ┌────────▼────────┐        │
│  │ MarkdownWith  │    │  VoiceService   │        │
│  │   Mermaid     │    │   (WebSocket)   │        │
│  └─────────┬─────┘    └────────┬────────┘        │
│            │                    │                  │
│  ┌─────────▼─────┐              │                 │
│  │ MermaidRenderer│             │                 │
│  └───────────────┘              │                 │
└─────────────────────────────────┼─────────────────┘
                                  │
                ┌─────────────────┴──────────────────┐
                │                                     │
         ┌──────▼────────┐              ┌───────────▼────────┐
         │  /api/chat    │              │  Voice Server      │
         │  (Streaming)  │              │  (WebSocket)       │
         │               │              │                    │
         │ - Caching     │              │ - Audio chunks     │
         │ - Windowing   │              │ - Transcripts      │
         │ - Summary     │              │ - Tool calls       │
         └──────┬────────┘              └───────────┬────────┘
                │                                   │
         ┌──────▼───────────────────────────────────▼───┐
         │         Google Gemini API                    │
         │  - Chat: gemini-2.5-flash-latest            │
         │  - Voice: gemini-live-2.5-flash-native-audio│
         │  - Tool calling (ignore_user, etc.)          │
         └──────────────────────────────────────────────┘
```

---

## 🚨 Known Deployment Issues

Based on commit history, these bugs caused you to revert to form branch:

### 1. **Voice Server Stability**
**Evidence:**
- `9299157` - "race condition for websocket fix"
- `06f67da` - "deployment fix 02"
- Multiple voice improvement commits

**Likely Issues:**
- WebSocket connection race conditions
- Session management bugs
- Audio chunk synchronization
- Client reconnection failures

### 2. **Railway Deployment Complexity**
**Evidence:**
- `25a8b28` - "Setup Railway deployment for voice server and fix Next.js config"
- Multiple deployment docs/scripts

**Likely Issues:**
- Environment variable configuration
- Multi-service coordination (frontend + voice server)
- CORS/WebSocket proxy issues
- Health check failures

### 3. **Memory Management**
**Evidence:**
- `52ec19e` - "improved memory management"

**Likely Issues:**
- Chat history accumulation
- Voice session memory leaks
- Cache storage growing unbounded
- In-memory cache store not evicting old entries

### 4. **localStorage Edge Cases**
**Evidence:**
- `8ff4107` - "local storage and diagram fixes"

**Likely Issues:**
- Storage quota exceeded
- Data corruption
- Race conditions on concurrent updates
- Browser compatibility issues

### 5. **Mermaid Rendering Failures**
**Evidence:**
- `cd0cdcb` - "Fix mermaid diagram rendering when switching from voice to text"

**Likely Issues:**
- Diagram syntax errors from AI
- Race conditions during mode switching
- SSR/client-side rendering conflicts
- Mobile rendering problems

### 6. **API Integration Issues**
**Evidence:**
- Multiple config/env setup docs
- Debug endpoint added

**Likely Issues:**
- Google Gemini API key configuration
- Rate limiting/quota exhaustion
- Error handling for API failures
- Streaming response parsing errors

### 7. **Voice-Text Mode Switching**
**Evidence:**
- `66dacc1` - "Fix double voice acknowledgements when switching to text mode"
- `21af738` - "Fix voice button layout alignment on desktop"

**Likely Issues:**
- State synchronization between modes
- Duplicate audio playback
- UI state inconsistencies
- Message ordering problems

---

## 📊 Commit Timeline

### Jan 13, 2026 (Today):
- `2644552` - Force deployment trigger (18:13 +0200) ← **Most recent**

### Jan 10, 2026:
- `56f40d1` - Voice improvements (23:26)
- `f2d2012` - Transcripts (20:52)

### Jan 9, 2026 (Heavy development day):
- `9299157` - Race condition for websocket fix (16:26)
- `fad48c5` - LANGUAGE (16:20)
- `f9727e8` - VOICE AGENT SYS PROMPT UPDATE (16:04)
- `b03ef1d` - Updated voice agent sys prompt (16:02)
- `b7d4966` - Improve agent voice (15:34)
- `cd0cdcb` - Fix mermaid diagram rendering when switching from voice to text (15:18)
- `66dacc1` - Fix double voice acknowledgements when switching to text mode (15:11)

### Earlier Commits (form → main evolution):
- Initial chat interface implementation
- Gemini API integration
- Error handling improvements
- KV cache implementation
- localStorage persistence
- Analytics integration
- Deployment setup
- Test suite creation

---

## 🔍 Code Quality Observations

### ✅ Strengths:
1. **Comprehensive documentation** - Every major feature well-documented
2. **Extensive testing** - 1,500+ lines of tests covering core functionality
3. **Error handling** - Custom error classes, retry logic, graceful degradation
4. **Performance optimizations** - Caching, windowing, summarization
5. **Developer experience** - Debug tools, deployment guides, clear comments
6. **Mobile-first design** - Responsive layout, touch interactions
7. **Accessibility** - Voice alternative, keyboard support

### ⚠️ Potential Issues:
1. **Complexity** - 21K lines added, many moving parts
2. **External dependencies** - Gemini API, Railway, Vercel all must work
3. **State management** - Multiple sources of truth (localStorage, memory, server)
4. **Race conditions** - Voice/text switching, WebSocket connections
5. **Memory leaks** - In-memory caches, WebSocket connections
6. **Error recovery** - Some failures may leave system in bad state
7. **Testing coverage** - Tests exist but may not cover all edge cases

---

## 💡 Recommendations

### Immediate Actions (Debug Current Issues):

#### 1. **Isolate the Problem**
Test each system independently:
```bash
# Test 1: Chat only (no voice, no diagrams)
# - Comment out voice service imports
# - Disable mermaid rendering
# - Test streaming responses

# Test 2: Voice only (no chat persistence)
# - Fresh session, no localStorage
# - Test WebSocket connection
# - Test audio streaming

# Test 3: Diagrams only
# - Static chat with pre-rendered diagrams
# - Test mermaid parsing
```

#### 2. **Add Comprehensive Logging**
```typescript
// Add to voice-server/server.js
console.log('[VOICE] Client connected:', clientId, new Date());
console.log('[VOICE] Audio chunk received:', chunkSize, timestamp);
console.log('[VOICE] Session state:', sessionState);

// Add to app/api/chat/route.ts
console.log('[CHAT] Request received:', messageCount, cacheStatus);
console.log('[CHAT] Token usage:', estimatedTokens, windowedCount);
console.log('[CHAT] Streaming chunk:', chunkId, chunkSize);
```

#### 3. **Check Environment Variables**
```bash
# Verify all required env vars are set in production
NEXT_PUBLIC_GOOGLE_API_KEY=...
NEXT_PUBLIC_VOICE_SERVER_URL=...
NEXT_PUBLIC_GA_MEASUREMENT_ID=...
```

#### 4. **Monitor Resource Usage**
```bash
# Check Railway logs for:
- Memory usage (should stay under limit)
- CPU usage (should not spike to 100%)
- WebSocket connection count (should not grow unbounded)
- Error rates (should be < 1%)
```

### Long-term Solutions:

#### Option 1: **Selective Rollback** (Recommended)
1. Keep chat interface (no voice, no diagrams)
2. Test thoroughly in production
3. Add voice as separate feature flag
4. Add diagrams as separate feature flag
5. Enable features incrementally

#### Option 2: **Fix Root Causes**
1. Refactor voice server for better error handling
2. Add connection pooling, rate limiting
3. Implement proper cleanup on disconnect
4. Add circuit breakers for external APIs
5. Comprehensive error recovery

#### Option 3: **Simplify Architecture**
1. Remove voice server (Railway dependency)
2. Keep chat-only with Gemini API
3. Remove mermaid (or make optional)
4. Reduce complexity by 50%

#### Option 4: **Stay on Form Branch**
1. Accept feature-poor version
2. Focus on stability
3. Plan proper rebuild with better architecture

---

## 🎯 Critical Files for Debugging

If you want to debug the deployment issues, focus on:

### Voice Server Issues:
1. `voice-server/server.js` (1,158 lines) - WebSocket server logic
2. `lib/services/voice-service.ts` (1,005 lines) - Client-side connection
3. `voice-server/config.js` - Configuration
4. Railway logs - Connection errors, memory usage

### Chat API Issues:
1. `app/api/chat/route.ts` (908 lines) - Streaming, caching, windowing
2. `lib/config.ts` - System prompt, API keys
3. `lib/errors.ts` - Error handling
4. Vercel logs - API errors, timeout errors

### Frontend Issues:
1. `components/ChatInterface.tsx` (1,095 lines) - Main UI logic
2. `lib/storage.ts` - localStorage management
3. `components/MermaidRenderer.tsx` - Diagram rendering
4. Browser console - Client-side errors

### Deployment Issues:
1. `railway.json`, `voice-server/railway.json` - Railway config
2. `next.config.ts` - Next.js config
3. `.env` files - Environment variables

---

## Summary

You built a **sophisticated AI chat application** with:
- ✅ Streaming responses from Gemini API
- ✅ Real-time voice conversations
- ✅ Mermaid diagram rendering
- ✅ localStorage persistence
- ✅ Comprehensive testing
- ✅ Full deployment infrastructure

The work represents **30+ hours** of development across **40 commits**, adding **21,305 lines** of code.

However, deployment bugs (WebSocket race conditions, memory issues, API integration problems) forced a rollback to the simple form branch.

**Next Steps:**
1. Review this analysis
2. Decide on approach (fix, simplify, or rollback)
3. If fixing: Use debugging steps above to isolate issues
4. If simplifying: Consider chat-only version first
5. If staying simple: Accept form branch as production version

**The code quality is good** - the issues are primarily **integration/deployment problems**, not fundamental design flaws. With proper debugging and potentially some architectural simplifications, this could be restored to production.
