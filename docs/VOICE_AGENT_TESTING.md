# Voice Agent Testing Guide

Comprehensive guide for testing the FRAM voice agent using Gemini Live API with automated audio-based integration tests.

## Overview

This testing suite mirrors the successful `text-agent-test.js` approach but adapted for native audio testing with the Gemini Live API. It includes:

- **Audio generation** from text questions using Google Cloud Text-to-Speech
- **Automated voice testing** by streaming pre-recorded audio to Gemini Live API
- **Complete observability** including transcripts, tool calls, latency metrics
- **Same test coverage** as text agent (19 test questions)

## Architecture

### Text vs Voice Testing

| Aspect | Text Agent | Voice Agent |
|--------|------------|-------------|
| **Protocol** | HTTP/SSE Streaming | WebSocket (bidirectional) |
| **Input** | Text messages | PCM16 audio (16kHz) |
| **Output** | Text responses | Audio (24kHz) + Transcripts |
| **Endpoint** | `/api/chat` | `wss://generativelanguage.googleapis.com/...` |
| **Testing** | Direct text questions | Pre-recorded audio files |
| **Validation** | Text matching | Transcript validation |

### Test Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Generate Audio Files                                     │
│    npm run generate:audio                                   │
│    ├─ Reads TEST_QUESTIONS from text-agent-test-questions.js│
│    ├─ Uses Google Cloud Text-to-Speech                      │
│    ├─ Generates 19 .wav files (16kHz, mono, PCM16)         │
│    └─ Creates voice-agent-test-questions.js config          │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Run Voice Agent Tests                                    │
│    npm run test:voice -- --non-interactive                  │
│    ├─ Establishes WebSocket connection to Gemini Live       │
│    ├─ Sends each audio file as PCM16 chunks                 │
│    ├─ Receives audio response + text transcript             │
│    ├─ Tracks tool calls, latency, transcription accuracy    │
│    └─ Generates detailed test summary                       │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

### 1. Google Cloud Credentials

You need Google Cloud credentials for two services:

#### Text-to-Speech API (for audio generation)

```bash
# Option A: Service account key (recommended for CI/CD)
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"

# Option B: Application Default Credentials (recommended for local dev)
gcloud auth application-default login
```

**Enable the API:**
```bash
gcloud services enable texttospeech.googleapis.com
```

#### Gemini API Key (for voice testing)

Already configured in `.env.local`:
```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Install Dependencies

```bash
npm install
```

New dependencies added:
- `@google-cloud/text-to-speech@^5.8.0` - Audio generation
- `ws@^8.18.0` - WebSocket client

## Usage

### Step 1: Generate Test Audio Files

Convert the 19 test questions into audio files:

```bash
npm run generate:audio
```

**What this does:**
- Reads questions from `scripts/text-agent-test-questions.js`
- Generates `.wav` files in `scripts/test-audio/`
- Uses voice: `en-US-Neural2-J` (male, high-quality neural voice)
- Audio format: 16kHz, mono, PCM16 (Gemini Live API compatible)
- Creates `scripts/voice-agent-test-questions.js` config

**Output:**
```
scripts/test-audio/
├── 01-tell-me-about-fram.wav
├── 02-who-is-frams-owner.wav
├── 03-give-me-andreis-email.wav
├── 04-give-me-andreis-linkedin-account.wav
├── ...
└── 19-what-are-the-latest-developments-in-ai-as-o.wav
```

**Customization:**
Edit `scripts/generate-test-audio.js` to change:
- Voice model (line 22): `name: 'en-US-Neural2-C'` for female voice
- Speaking rate (line 30): `speakingRate: 1.2` for faster speech
- Pitch (line 29): `pitch: 2.0` for higher pitch

### Step 2: Run Voice Agent Tests

**Non-interactive mode** (automated testing with audio files):

```bash
npm run test:voice -- --non-interactive
```

**With verbose output** (shows WebSocket messages):

```bash
npm run test:voice -- --non-interactive --verbose
```

**Interactive mode** (microphone input):

```bash
npm run test:voice -- --interactive
```

> **Note:** Interactive mode requires additional microphone streaming implementation (not yet available). For now, use `--non-interactive` mode.

## Output & Metrics

The voice agent test provides similar observability to the text agent test:

### Console Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Question 1/19: "Tell me about Fram"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Step 1: Processing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🎤 Sending audio: test-audio/01-tell-me-about-fram.wav
  👂 Listening for response...

  🔧 Tool calls: 1
    1. kb_search

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Final Response
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FRAM is a design consultancy and digital product studio based in Bucharest,
specializing in product design, UX/UI, and digital experiences...

  ⏱️  Audio latency: 2847ms
  ⏱️  Total time: 3251ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Test Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Test Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total questions: 19
Successful responses: 19 (100.0%)
Failed responses: 0 (0.0%)
Total duration: 67.4s
Average response time: 3.5s
Average audio latency: 2.8s

Tool Calls:
  kb_search: 12 calls
  kb_get: 3 calls
  perplexity_search: 1 call

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Metrics Tracked

| Metric | Description |
|--------|-------------|
| **Audio Latency** | Time from sending last audio chunk to receiving first response |
| **Total Time** | End-to-end time including WebSocket overhead |
| **Tool Calls** | Number and type of tool invocations |
| **Transcription** | Text transcript of voice response |
| **Success Rate** | Percentage of questions answered successfully |

## Audio File Specifications

### Input Audio (Questions)

- **Format**: WAV (PCM16)
- **Sample Rate**: 16,000 Hz (16kHz)
- **Channels**: Mono
- **Bit Depth**: 16-bit
- **Encoding**: Linear PCM
- **Typical Size**: ~10-30 KB per question

### Output Audio (Responses)

- **Format**: PCM16 (received as base64)
- **Sample Rate**: 24,000 Hz (24kHz)
- **Channels**: Mono
- **Bit Depth**: 16-bit

## Troubleshooting

### "Could not load voice-agent-test-questions.js"

**Solution:** Run audio generation first:
```bash
npm run generate:audio
```

### "GOOGLE_APPLICATION_CREDENTIALS not set"

**Solution:** Set up Google Cloud credentials:
```bash
# Option 1: Service account
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"

# Option 2: Application default
gcloud auth application-default login
```

### "GEMINI_API_KEY not set"

**Solution:** Add to `.env.local`:
```bash
GEMINI_API_KEY=your_api_key_here
```

### "WebSocket error: Connection refused"

**Causes:**
- Invalid API key
- Network connectivity issues
- Gemini Live API endpoint changed

**Solution:** Verify API key and network connection.

### Audio files sound wrong

**Check:**
- Voice model in `generate-test-audio.js` (line 22)
- Speaking rate (line 30)
- Ensure Google TTS API is enabled

## Comparison with Text Agent Testing

### Similarities

Both test suites share:
- Same 19 test questions
- Same validation approach (transcript/text matching)
- Same observability (tool calls, metrics, summaries)
- Same coverage (KB search, retrieval, multimodal, edge cases)

### Differences

| Aspect | Text Agent | Voice Agent |
|--------|------------|-------------|
| **Runtime** | ~60s (19 questions) | ~70s (19 questions) |
| **Latency** | 3-5s average | 2-3s audio latency + overhead |
| **Setup** | No audio generation | Requires audio generation step |
| **Protocol** | HTTP/SSE | WebSocket |
| **Caching** | Gemini prompt caching (83%) | No caching (real-time audio) |

## Advanced Usage

### Custom Test Questions

Add your own questions to `scripts/text-agent-test-questions.js`:

```javascript
export const TEST_QUESTIONS = [
  "Tell me about Fram",
  "Who is Fram's owner?",
  // Add your questions here
  "What is Andrei's favorite project?",
  "How does FRAM approach UX design?"
];
```

Then regenerate audio:
```bash
npm run generate:audio
```

### Different Voice Models

Edit `scripts/generate-test-audio.js`:

```javascript
// Female voice
const VOICE_CONFIG = {
  languageCode: 'en-US',
  name: 'en-US-Neural2-C',
  ssmlGender: 'FEMALE'
};

// British accent
const VOICE_CONFIG = {
  languageCode: 'en-GB',
  name: 'en-GB-Neural2-B',
  ssmlGender: 'MALE'
};
```

Available voices: [Google Cloud TTS Voices](https://cloud.google.com/text-to-speech/docs/voices)

### CI/CD Integration

```yaml
# .github/workflows/test-voice-agent.yml
name: Voice Agent Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '24'

      - name: Install dependencies
        run: npm ci

      - name: Generate test audio
        env:
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCP_SA_KEY }}
        run: npm run generate:audio

      - name: Run voice agent tests
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: npm run test:voice -- --non-interactive
```

## Future Enhancements

### Planned Features

- [ ] Interactive mode with microphone streaming
- [ ] Audio quality analysis (SNR, clarity metrics)
- [ ] Voice Activity Detection (VAD) testing
- [ ] Barge-in capability testing (interruptions)
- [ ] Multilingual testing (24 supported languages)
- [ ] Speech-to-text accuracy benchmarking
- [ ] Audio response playback and validation
- [ ] Parallel test execution for faster runs

### Contributing

To add new features:

1. Update `scripts/voice-agent-test.js`
2. Add new test questions to `scripts/text-agent-test-questions.js`
3. Regenerate audio files
4. Run tests and verify
5. Update this documentation

## References

- [Gemini Live API Documentation](https://ai.google.dev/gemini-api/docs/live)
- [WebSocket API Reference](https://ai.google.dev/api/live)
- [Google Cloud Text-to-Speech](https://cloud.google.com/text-to-speech/docs)
- [Text Agent Testing Guide](../scripts/text-agent-test.js)

## License

Same as FRAM project (see root LICENSE file).
