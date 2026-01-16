# Voice Mode KB Tools Testing - Log Monitoring Guide

## ✅ Setup Complete

- **Dev server**: Running on http://localhost:3000
- **Voice server**: Running on ws://localhost:8080
- **Log monitoring**: Active

## 📊 Monitoring Commands

### Real-time Monitoring (Recommended)
```bash
# View filtered KB tool logs with timestamps
tail -f /tmp/framdesign-dev.log | grep '\[VOICE\]' | grep -E '(kb_search|kb_get|tool_execution|Client connected)'

# Or use the monitoring script
./scripts/monitor-voice-simple.sh
```

### Quick Status Check
```bash
# Check recent KB tool activity
./scripts/check-voice-logs.sh
```

### View All Voice Logs
```bash
tail -f /tmp/framdesign-dev.log | grep '\[VOICE\]'
```

## 🔍 What to Look For

### 1. Voice Session Start
Look for:
```
[VOICE] [TIMESTAMP-xxxxx] Client connected
```

### 2. KB Tool Execution (kb_search)
Look for:
```
[VOICE] {"event":"tool_execution","toolId":"kb_search","mode":"voice","duration":XXX,"ok":true}
[VOICE] [kb_search] Found X results in XXXms
```

### 3. KB Tool Execution (kb_get)
Look for:
```
[VOICE] {"event":"tool_execution","toolId":"kb_get","mode":"voice","duration":XXX,"ok":true}
[VOICE] [kb_get] Retrieved X chunks in XXXms
```

### 4. Tool Execution Details
Each tool execution logs JSON with:
- `toolId`: "kb_search" or "kb_get"
- `mode`: "voice"
- `duration`: milliseconds
- `ok`: true/false
- `category`: "retrieval"

## 🧪 Test Steps

1. **Start Voice Session**
   - Click VOICE button in text chat
   - Grant microphone permissions
   - Watch for: `Client connected` log

2. **Test KB Search**
   - Ask: "What can you tell me about design process?"
   - Watch for:
     - `tool_execution` log with `toolId: "kb_search"`
     - `[kb_search] Found X results` log
     - Verify `mode: "voice"` in JSON
     - Verify results clamped to ≤3 (voice mode)

3. **Test KB Get**
   - Ask: "Get information about Andrei"
   - Watch for:
     - `tool_execution` log with `toolId: "kb_get"`
     - `[kb_get] Retrieved X chunks` log
     - Verify correct entity ID returned

4. **Check Latency**
   - Verify `duration` is within budget:
     - kb_search: ≤800ms
     - kb_get: ≤500ms

## 📝 Log Format Examples

### Successful KB Search
```json
{"event":"tool_execution","toolId":"kb_search","toolVersion":"1.0.0","registryVersion":"1.0.249a595d","duration":422,"ok":true,"category":"retrieval","sessionId":"1768552027542-4r1pgk","mode":"voice"}
```

### Successful KB Get
```json
{"event":"tool_execution","toolId":"kb_get","toolVersion":"1.0.0","registryVersion":"1.0.249a595d","duration":338,"ok":true,"category":"retrieval","sessionId":"1768552027542-4r1pgk","mode":"voice"}
```

## 🚨 Troubleshooting

### No logs appearing?
- Check if voice server is running: `curl http://localhost:8080/health`
- Check if log file exists: `ls -lh /tmp/framdesign-dev.log`

### Tool not being called?
- Check browser console for errors
- Verify WebSocket connection is established
- Check voice server logs for connection errors

### Tool execution fails?
- Check `ok: false` in tool_execution log
- Look for error messages in voice server logs
- Verify KB embeddings are loaded (run embedding script)

## 📍 Log File Locations

- **Dev server logs**: `/tmp/framdesign-dev.log`
- **Filtered monitor logs**: `/tmp/voice-monitor.log` (if using monitor script)
