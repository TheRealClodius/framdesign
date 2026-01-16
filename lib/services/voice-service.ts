/**
 * Voice service for WebSocket-based real-time voice interactions
 * Handles microphone capture, audio processing, and WebSocket communication
 */

import { VOICE_CONFIG } from '@/lib/config-voice';

export interface VoiceTranscript {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface VoiceSessionResult {
  transcripts: {
    user: VoiceTranscript[];
    assistant: VoiceTranscript[];
  };
}

interface WebSocketMessage {
  type: string;
  clientId?: string;
  sessionId?: string;
  data?: string;
  role?: 'user' | 'assistant';
  text?: string;
  transcripts?: { user: VoiceTranscript[]; assistant: VoiceTranscript[] };
  error?: string;
  durationSeconds?: number;
  timeoutUntil?: number;
  farewellMessage?: string;
  reason?: string;
  closingMessage?: string;
  textResponse?: string;
}

export class VoiceService extends EventTarget {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioWorkletNode: ScriptProcessorNode | null = null;
  private isActive = false;
  private audioQueue: AudioBufferSourceNode[] = [];
  private nextPlayTime = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private pendingRequest: string | null = null;
  private isIntentionallyStopping = false;
  private startPromiseResolve: ((value: void) => void) | null = null;
  private startPromiseReject: ((reason?: unknown) => void) | null = null;
  private partialTranscripts: { user: VoiceTranscript[]; assistant: VoiceTranscript[] } = {
    user: [],
    assistant: []
  };
  private audioPlaybackErrors = 0;
  private maxAudioPlaybackErrors = 5;
  private consecutiveSilentChunks = 0; // Track consecutive silent chunks for silence detection
  private shouldPauseAudioSending = false; // Pause sending when agent is processing or sustained silence
  private SILENCE_PAUSE_THRESHOLD = 10; // Pause after 10 consecutive silent chunks (~1 second)
  private SILENCE_THRESHOLD = 0.0005; // Threshold for detecting silence
  // Threshold for intentional speech (to interrupt agent) - raised from 0.015 to reduce false interruptions
  // This prevents background noise (fans, AC, keyboard) from triggering interruptions
  private SPEECH_INTERRUPT_THRESHOLD = 0.025;
  
  constructor() {
    super();
  }

  /**
   * Start voice session with conversation context
   * @param conversationHistory - Previous chat messages for context
   * @param pendingRequest - Optional pending user request to address immediately (from text agent handoff)
   */
  async start(conversationHistory: Array<{ role: string; content: string }>, pendingRequest: string | null = null): Promise<void> {
    if (this.isActive) {
      console.warn('Attempted to start voice session while already active');
      throw new Error('Voice session already active');
    }
    
    this.pendingRequest = pendingRequest;
    if (pendingRequest) {
      console.log(`📌 Voice session will address pending request: "${pendingRequest}"`);
    }

    // Ensure any previous session is fully cleaned up before starting
    // This is critical for proper reinitialization after stopping
    if (this.ws || this.audioContext || this.mediaStream || this.audioWorkletNode) {
      console.log('Previous session resources detected, cleaning up before starting new session...');
      
      // Store WebSocket reference before cleanup
      const existingWs = this.ws;
      
      // Mark as intentionally stopping to prevent reconnection attempts
      this.isIntentionallyStopping = true;
      this.isActive = false;
      
      // Clean up resources
      this.cleanup();
      
      // Wait for WebSocket to fully close if it existed
      if (existingWs) {
        await new Promise<void>((resolve) => {
          if (existingWs.readyState === WebSocket.CLOSED) {
            resolve();
            return;
          }
          
          const checkClosed = setInterval(() => {
            if (existingWs.readyState === WebSocket.CLOSED) {
              clearInterval(checkClosed);
              resolve();
            }
          }, 50);
          
          // Timeout after 1 second
          setTimeout(() => {
            clearInterval(checkClosed);
            resolve();
          }, 1000);
        });
      }
      
      // Wait a brief moment to ensure all cleanup completes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('Cleanup complete, starting new session');
    }

    // Validate WebSocket URL
    if (!VOICE_CONFIG.WEBSOCKET_URL || (!VOICE_CONFIG.WEBSOCKET_URL.startsWith('ws://') && !VOICE_CONFIG.WEBSOCKET_URL.startsWith('wss://'))) {
      const error = new Error('Invalid WebSocket URL. Please configure NEXT_PUBLIC_VOICE_SERVER_URL');
      this.dispatchEvent(new CustomEvent('error', {
        detail: { message: error.message }
      }));
      throw error;
    }

    // Reset reconnection state
    this.isIntentionallyStopping = false;
    this.reconnectAttempts = 0;
    this.conversationHistory = conversationHistory;
    this.partialTranscripts = { user: [], assistant: [] };
    this.audioPlaybackErrors = 0;
    this.nextPlayTime = 0;

    // 1. Request microphone permission
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000, // Browser native
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (error) {
      this.dispatchEvent(new CustomEvent('error', {
        detail: { message: 'Microphone permission denied' }
      }));
      throw error;
    }

    // 2. Setup audio context for processing
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    
    // 3. Connect to WebSocket server
    return this.connectWebSocket();
  }

  /**
   * Connect to WebSocket server with reconnection support
   */
  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.startPromiseResolve = resolve;
      this.startPromiseReject = reject;

      try {
        this.ws = new WebSocket(VOICE_CONFIG.WEBSOCKET_URL);

        this.ws.onopen = async () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0; // Reset on successful connection
          
          // Clear any pending reconnect timer
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          
          // 4. Setup audio processing pipeline
          await this.setupAudioProcessing();
          
          // 5. Set active immediately so audio processing can start
          this.isActive = true;
          console.log('Session marked as active, audio processing will now work');
          
          // 6. Send start message with conversation history and pending request
          this.ws!.send(JSON.stringify({
            type: 'start',
            conversationHistory: this.conversationHistory,
            pendingRequest: this.pendingRequest
          }));

          // Start heartbeat to detect disconnections
          this.startHeartbeat();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.ws.onerror = (event) => {
          // WebSocket error events don't provide detailed error info
          // The onclose handler provides more useful information (close codes, reasons)
          // Only log at debug level to avoid noise - onclose will handle user-visible errors
          if (this.ws) {
            const wsState = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][this.ws.readyState];
            console.debug('WebSocket error event:', {
              state: wsState,
              readyState: this.ws.readyState,
              url: VOICE_CONFIG.WEBSOCKET_URL || 'not configured'
            });
          }
          // Don't reject immediately - let onclose handle reconnection and logging
        };

        this.ws.onclose = (event) => {
          console.log('WebSocket closed', { code: event.code, reason: event.reason });
          
          // Stop heartbeat
          this.stopHeartbeat();
          
          // Only attempt reconnection if not intentionally stopping and session was active
          if (!this.isIntentionallyStopping && this.isActive) {
            this.attemptReconnection();
          } else {
            // Clean up if intentionally stopping or never started
            if (!this.isActive) {
              this.cleanup();
            }
          }
        };
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        this.dispatchEvent(new CustomEvent('error', {
          detail: { message: 'Failed to create WebSocket connection' }
        }));
        reject(error);
      }
    });
  }

  /**
   * Attempt to reconnect with exponential backoff
   * Enhanced with partial transcript saving before disconnect
   */
  private attemptReconnection(): void {
    if (this.reconnectAttempts >= VOICE_CONFIG.RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      
      // Save partial transcripts before giving up
      if (this.partialTranscripts.user.length > 0 || this.partialTranscripts.assistant.length > 0) {
        console.log('Saving partial transcripts before disconnect');
        this.dispatchEvent(new CustomEvent('partialTranscripts', {
          detail: { transcripts: { ...this.partialTranscripts } }
        }));
      }
      
      this.dispatchEvent(new CustomEvent('error', {
        detail: { 
          message: 'Connection lost. Max reconnection attempts reached.',
          canRetry: false,
          partialTranscripts: this.partialTranscripts
        }
      }));
      this.isActive = false;
      this.cleanup();
      this.startPromiseReject?.(new Error('Connection lost'));
      return;
    }

    this.reconnectAttempts++;
    const delay = VOICE_CONFIG.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    console.log(`Attempting reconnection ${this.reconnectAttempts}/${VOICE_CONFIG.RECONNECT_ATTEMPTS} in ${delay}ms`);
    
    this.dispatchEvent(new CustomEvent('reconnecting', {
      detail: { attempt: this.reconnectAttempts, maxAttempts: VOICE_CONFIG.RECONNECT_ATTEMPTS }
    }));

    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket().catch((error) => {
        console.error('Reconnection failed:', error);
        // Will retry automatically if attempts remain
      });
    }, delay);
  }

  /**
   * Start heartbeat/ping mechanism to detect disconnections
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // Clear any existing heartbeat
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('Failed to send ping:', error);
        }
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Setup audio processing: capture mic → convert to PCM16 → send to server
   */
  private async setupAudioProcessing(): Promise<void> {
    if (!this.audioContext || !this.mediaStream) {
      console.error('Cannot setup audio processing: missing audioContext or mediaStream');
      return;
    }

    console.log('Setting up audio processing pipeline...');
    console.log(`AudioContext state: ${this.audioContext.state}, sampleRate: ${this.audioContext.sampleRate}`);
    
    // Ensure AudioContext is running (may be suspended until user interaction)
    if (this.audioContext.state === 'suspended') {
      console.log('AudioContext is suspended, attempting to resume...');
      try {
        await this.audioContext.resume();
        console.log(`AudioContext resumed, state: ${this.audioContext.state}`);
      } catch (error) {
        console.error('Failed to resume AudioContext:', error);
      }
    }
    
    // Check media stream tracks
    const tracks = this.mediaStream.getAudioTracks();
    console.log(`MediaStream has ${tracks.length} audio tracks`);
    tracks.forEach((track, i) => {
      console.log(`Track ${i}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}, label=${track.label}`);
    });

    // Create audio source from microphone
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    console.log('Audio source created from microphone');
    
    // Create script processor for audio chunks
    // Note: ScriptProcessorNode is deprecated but widely supported
    // For production, consider migrating to AudioWorkletNode
    const bufferSize = 4096;
    const processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    console.log('ScriptProcessorNode created');
    
    processor.onaudioprocess = (e) => {
      if (!this.isActive) {
        return;
      }
      
      try {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // DEBUG: Check if we're getting real audio data
        let maxVal = 0;
        let sumVal = 0;
        for (let i = 0; i < inputData.length; i++) {
          const absVal = Math.abs(inputData[i]);
          if (absVal > maxVal) maxVal = absVal;
          sumVal += absVal;
        }
        const avgVal = sumVal / inputData.length;
        
        // Two-tier threshold system to distinguish ambient noise from intentional speech
        const isSilent = maxVal < this.SILENCE_THRESHOLD;
        const isIntentionalSpeech = maxVal >= this.SPEECH_INTERRUPT_THRESHOLD;
        
        // Track consecutive silent chunks
        if (isSilent) {
          this.consecutiveSilentChunks = (this.consecutiveSilentChunks || 0) + 1;
        } else if (isIntentionalSpeech) {
          // Only resume sending if it's clearly intentional speech (not just ambient noise)
          this.consecutiveSilentChunks = 0;
          if (this.shouldPauseAudioSending) {
            console.log(`User interrupting (volume: ${maxVal.toFixed(4)}) - resuming audio sending`);
          }
          this.shouldPauseAudioSending = false;
        } else {
          // Ambient noise (above silence but below speech threshold) - don't resume sending
          // This prevents fans, keyboard clicks, etc. from triggering false interruptions
          this.consecutiveSilentChunks = 0; // Reset to avoid premature turn_complete
        }
        
        // Pause sending after sustained silence (user stopped speaking)
        if (this.consecutiveSilentChunks >= this.SILENCE_PAUSE_THRESHOLD) {
          if (!this.shouldPauseAudioSending) {
            console.log(`User stopped speaking - signaling turn complete after ${this.consecutiveSilentChunks} consecutive silent chunks`);
            this.shouldPauseAudioSending = true;
            
            // CRITICAL: Signal to server that user's turn is complete
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              try {
                this.ws.send(JSON.stringify({ type: 'turn_complete' }));
                console.log('✓ Sent turn_complete signal to server');
              } catch (error) {
                console.error('Error sending turn_complete signal:', error);
              }
            }
          }
          // Don't send silent chunks - let Gemini process what it has
          return;
        }
        
        // Don't send audio if paused (agent is processing/speaking)
        // BUT allow intentional speech through so user can interrupt
        if (this.shouldPauseAudioSending && !isIntentionalSpeech) {
          // Block ambient noise and silence, but allow real speech interruptions
          return;
        }
        
        // Log audio levels periodically (every ~100 chunks, less verbose)
        if (Math.random() < 0.01) {
          console.log(`Audio levels - max: ${maxVal.toFixed(4)}, avg: ${avgVal.toFixed(6)}, silent_chunks: ${this.consecutiveSilentChunks || 0}, paused: ${this.shouldPauseAudioSending}`);
        }
        
        // Skip completely silent chunks (all zeros means mic not working)
        if (maxVal < 0.0001) {
          // Still send to server to maintain stream, but log warning rarely
          if (Math.random() < 0.001) {
            console.warn('Audio appears to be silent (all zeros) - check microphone');
          }
        }
        
        // Resample from 48kHz to 16kHz
        const resampled = this.resample(inputData, 48000, 16000);
        
        // Convert Float32 to PCM16
        const pcm16 = this.floatToPCM16(resampled);
        
        // Convert to Base64 and send
        const base64 = this.arrayBufferToBase64(pcm16);
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            // Reduced logging - only log every 50th chunk or when significant events occur
            if (Math.random() < 0.02 || this.consecutiveSilentChunks === 50) {
              console.log(`Sending audio chunk (${base64.length} bytes, silent_streak: ${this.consecutiveSilentChunks || 0})`);
            }
            this.ws.send(JSON.stringify({
              type: 'audio',
              data: base64
            }));
          } catch (sendError) {
            console.error('Error sending audio chunk:', sendError);
            // Don't throw - continue processing audio
          }
        } else {
          if (Math.random() < 0.01) { // Reduce warning frequency
            console.warn('WebSocket not open, cannot send audio. State:', this.ws?.readyState);
          }
        }
      } catch (error) {
        console.error('Error processing audio chunk:', error);
        // Don't throw - continue processing to avoid breaking the audio pipeline
      }
    };
    
    // Connect nodes: Mic → Processor → Destination (but muted)
    source.connect(processor);
    processor.connect(this.audioContext.destination);
    
    this.audioWorkletNode = processor;
  }

  /**
   * Resample audio from one rate to another using linear interpolation
   */
  private resample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return buffer;
    
    const ratio = fromRate / toRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, buffer.length - 1);
      const t = srcIndex - srcIndexFloor;
      
      // Linear interpolation
      result[i] = buffer[srcIndexFloor] * (1 - t) + buffer[srcIndexCeil] * t;
    }
    
    return result;
  }

  /**
   * Convert Float32 audio samples to PCM16
   */
  private floatToPCM16(float32Array: Float32Array): ArrayBuffer {
    const pcm16 = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] and convert to 16-bit integer
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    return pcm16.buffer;
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'connected':
        console.log('Server connected:', message.clientId);
        break;

      case 'started':
        this.isActive = true;
        console.log('Voice session started:', message.sessionId);
        this.dispatchEvent(new CustomEvent('started', { detail: message }));
        this.startPromiseResolve?.();
        this.startPromiseResolve = null;
        this.startPromiseReject = null;
        break;

      case 'audio':
        // Immediately pause sending when agent starts speaking
        if (!this.shouldPauseAudioSending) {
          console.log('Agent started speaking - pausing audio sending');
          this.shouldPauseAudioSending = true;
          this.consecutiveSilentChunks = 0;
        }
        // Play audio response from Gemini
        if (message.data) {
          this.playAudio(message.data);
        }
        break;

      case 'transcript':
        // Store partial transcript for recovery
        if (message.role && message.text) {
          const transcript: VoiceTranscript = {
            role: message.role,
            text: message.text,
            timestamp: Date.now()
          };
          
          if (message.role === 'user') {
            this.partialTranscripts.user.push(transcript);
          } else {
            this.partialTranscripts.assistant.push(transcript);
            // Agent is speaking - resume audio sending for next turn
            if (this.shouldPauseAudioSending) {
              console.log('Agent responded, resuming audio sending');
              this.shouldPauseAudioSending = false;
              this.consecutiveSilentChunks = 0;
            }
          }
          
          // Emit transcript for real-time display
          const transcriptPreview = message.text.substring(0, 50);
          console.log(`Transcript event dispatched: ${message.role} - ${transcriptPreview}...`);
          this.dispatchEvent(new CustomEvent('transcript', {
            detail: {
              role: message.role,
              text: message.text
            }
          }));
        }
        break;

      case 'session_complete':
        // Session ended, return transcripts (prefer server transcripts, fallback to partial)
        const finalTranscripts = message.transcripts || this.partialTranscripts;
        this.dispatchEvent(new CustomEvent('complete', {
          detail: { transcripts: finalTranscripts }
        }));
        // Reset partial transcripts
        this.partialTranscripts = { user: [], assistant: [] };
        break;

      case 'stopped':
        console.log('Voice session stopped');
        break;

      case 'error':
        console.error('Server error:', message.error);
        
        // Check for specific error types
        const errorMessage = message.error || 'Unknown error';
        const errorDetails = 'details' in message ? (message as WebSocketMessage & { details?: { type?: string; suggestion?: string; helpUrl?: string } }).details : null;
        let userFriendlyMessage = errorMessage;
        let canRetry = true;
        
        if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
          userFriendlyMessage = 'API quota exceeded. Please try again later.';
          canRetry = false;
        } else if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
          userFriendlyMessage = 'Microphone permission denied. Please grant permission and try again.';
        } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
          userFriendlyMessage = 'Network connection error. Attempting to reconnect...';
        } else if (errorMessage.includes('Authentication failed') || errorMessage.includes('invalid_grant') || errorMessage.includes('invalid_rapt')) {
          userFriendlyMessage = 'Authentication error: Please check your Google Cloud credentials configuration.';
          canRetry = false;
          // Include helpful details if available
          if (errorDetails) {
            userFriendlyMessage += ` ${errorDetails.suggestion || ''}`;
          }
        }
        
        this.dispatchEvent(new CustomEvent('error', {
          detail: { 
            message: userFriendlyMessage,
            originalError: errorMessage,
            details: errorDetails,
            canRetry: canRetry && !errorMessage.includes('quota') && !errorMessage.includes('rate limit')
          }
        }));
        
        // Only reject if we're still in the start phase
        if (this.startPromiseReject) {
          this.startPromiseReject(new Error(userFriendlyMessage));
          this.startPromiseResolve = null;
          this.startPromiseReject = null;
        }
        break;

      case 'interrupted':
        // Model was interrupted by user speech - stop audio playback immediately
        console.log('Model interrupted - stopping audio playback');
        this.stopAudioPlayback();
        break;

      case 'timeout':
        // User has been timed out by the ignore_user tool
        console.log('User timed out:', message);
        console.log(`Audio queue length: ${this.audioQueue.length} sources still playing`);
        
        // Wait for farewell message audio to finish playing before ending session
        const waitForTimeoutAudio = () => {
          if (this.audioQueue.length > 0) {
            console.log(`Waiting for ${this.audioQueue.length} farewell audio sources to finish...`);
            // Check again in 100ms
            setTimeout(waitForTimeoutAudio, 100);
          } else {
            // All audio has finished playing, add buffer for safety
            console.log('Farewell audio complete, adding 1000ms buffer before timeout');
            setTimeout(() => {
              console.log('Audio playback complete, now applying timeout');
              
              // Emit timeout event with details for UI handling
              this.dispatchEvent(new CustomEvent('timeout', {
                detail: {
                  durationSeconds: message.durationSeconds,
                  timeoutUntil: message.timeoutUntil,
                  farewellMessage: message.farewellMessage
                }
              }));
              
              // Stop the voice session
              this.isActive = false;
              this.isIntentionallyStopping = true;
            }, 1000); // 1 second buffer after last audio finishes to ensure complete playback
          }
        };
        
        // Start waiting for audio completion
        waitForTimeoutAudio();
        break;

      case 'end_voice_session':
        // Voice session ended gracefully by the agent
        console.log('Voice session ended by agent:', message);
        console.log(`Audio queue length: ${this.audioQueue.length} sources still playing`);
        
        // Wait for all audio chunks to finish playing before ending session
        const waitForAudioCompletion = () => {
          if (this.audioQueue.length > 0) {
            console.log(`Waiting for ${this.audioQueue.length} audio sources to finish...`);
            // Check again in 100ms
            setTimeout(waitForAudioCompletion, 100);
          } else {
            // All audio has finished playing, add buffer for safety
            console.log('All audio chunks played, adding 1000ms buffer before ending session');
            setTimeout(() => {
              console.log('Audio playback complete, now ending session');
              
              // Emit end session event with details for UI handling
              this.dispatchEvent(new CustomEvent('endVoiceSession', {
                detail: {
                  reason: message.reason,
                  closingMessage: message.closingMessage,
                  textResponse: message.textResponse || null // Include optional full text response
                }
              }));
              
              // Stop the voice session gracefully
              this.isActive = false;
              this.isIntentionallyStopping = true;
            }, 1000); // 1 second buffer after last audio finishes to ensure complete playback
          }
        };
        
        // Start waiting for audio completion
        waitForAudioCompletion();
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'model_generating':
        // Server signaled model is generating - pause immediately
        if (!this.shouldPauseAudioSending) {
          console.log('Model generating - pausing audio sending');
          this.shouldPauseAudioSending = true;
          this.consecutiveSilentChunks = 0;
        }
        break;

      case 'tools_complete':
        // Tools completed - keep paused, will resume when agent starts speaking (receives audio)
        console.log(`Tools complete (${(message as any).toolCount || 'unknown'} tools) - waiting for agent response`);
        // Don't resume yet - wait for agent to start speaking (audio chunks)
        break;

      case 'turn_complete':
        // Turn complete - resume sending for next turn
        console.log('Turn complete - resuming audio sending');
        this.shouldPauseAudioSending = false;
        this.consecutiveSilentChunks = 0;
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Play audio response from server
   * Enhanced with error handling, format validation, and graceful degradation
   */
  private async playAudio(base64Data: string): Promise<void> {
    if (!this.audioContext) {
      console.warn('Audio context not available for playback');
      return;
    }

    // Reset error counter on successful playback
    if (this.audioPlaybackErrors > 0 && this.audioPlaybackErrors < this.maxAudioPlaybackErrors) {
      this.audioPlaybackErrors = 0;
    }

    // Stop playback if too many errors (likely format incompatibility)
    if (this.audioPlaybackErrors >= this.maxAudioPlaybackErrors) {
      console.warn('Too many audio playback errors, skipping audio chunks');
      this.dispatchEvent(new CustomEvent('audioError', {
        detail: { 
          message: 'Audio playback disabled due to format incompatibility. Transcripts will still be displayed.',
          recoverable: false
        }
      }));
      return;
    }

    try {
      // Validate base64 data
      if (!base64Data || typeof base64Data !== 'string' || base64Data.length === 0) {
        throw new Error('Invalid audio data: empty or invalid format');
      }

      // Decode Base64 to PCM16
      let binaryString: string;
      try {
        binaryString = atob(base64Data);
      } catch {
        throw new Error('Invalid base64 audio data');
      }

      if (binaryString.length === 0) {
        throw new Error('Empty audio data after base64 decoding');
      }

      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Validate PCM16 data length (must be even for 16-bit samples)
      let audioBytes = bytes;
      if (bytes.length % 2 !== 0) {
        console.warn('Audio data length is odd, padding with zero');
        const paddedBytes = new Uint8Array(bytes.length + 1);
        paddedBytes.set(bytes);
        audioBytes = paddedBytes;
      }
      
      // Convert PCM16 to Float32 for Web Audio
      const pcm16 = new Int16Array(audioBytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      
      for (let i = 0; i < pcm16.length; i++) {
        // Normalize to [-1, 1] range
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
      }
      
      // Validate audio buffer parameters
      // Note: Gemini Live API outputs audio at 24kHz, not 16kHz
      const sampleRate = 24000;
      if (float32.length === 0) {
        throw new Error('Empty audio buffer');
      }
      
      // Create audio buffer with error handling
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = this.audioContext.createBuffer(1, float32.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32);
      } catch (error) {
        throw new Error(`Failed to create audio buffer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      // Validate audio buffer duration
      if (audioBuffer.duration <= 0 || !isFinite(audioBuffer.duration)) {
        throw new Error('Invalid audio buffer duration');
      }
      
      // Apply pitch shifting for deep voice effect
      let playbackRate = 1.0;
      if (VOICE_CONFIG.ENABLE_PITCH_SHIFT && VOICE_CONFIG.PITCH_SHIFT_SEMITONES !== 0) {
        // Convert semitones to playback rate: rate = 2^(semitones/12)
        // Negative semitones = deeper voice (lower pitch)
        playbackRate = Math.pow(2, VOICE_CONFIG.PITCH_SHIFT_SEMITONES / 12);
        console.log(`Applying pitch shift: ${VOICE_CONFIG.PITCH_SHIFT_SEMITONES} semitones (playbackRate: ${playbackRate.toFixed(3)})`);
      }
      
      // Queue for playback
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = playbackRate;
      source.connect(this.audioContext.destination);
      
      // Schedule playback to avoid gaps
      // Adjust timing for pitch shift: slower playback = longer duration
      const now = this.audioContext.currentTime;
      const startTime = Math.max(now, this.nextPlayTime);
      const adjustedDuration = audioBuffer.duration / playbackRate;
      
      try {
        source.start(startTime);
        this.nextPlayTime = startTime + adjustedDuration;
        
        this.audioQueue.push(source);
        
        // Emit speaking event
        this.dispatchEvent(new CustomEvent('speaking', { detail: { speaking: true } }));
        
        source.onended = () => {
          const index = this.audioQueue.indexOf(source);
          if (index > -1) this.audioQueue.splice(index, 1);
          
          if (this.audioQueue.length === 0) {
            this.dispatchEvent(new CustomEvent('speaking', { detail: { speaking: false } }));
          }
        };
      } catch (startError) {
        // Handle case where audio context is suspended (user interaction required)
        if (this.audioContext.state === 'suspended') {
          console.warn('Audio context suspended, attempting to resume');
          try {
            await this.audioContext.resume();
            source.start(startTime);
            const adjustedDuration = audioBuffer.duration / playbackRate;
            this.nextPlayTime = startTime + adjustedDuration;
            this.audioQueue.push(source);
          } catch (resumeError) {
            console.error('Failed to resume audio context:', resumeError);
            this.audioPlaybackErrors++;
            this.dispatchEvent(new CustomEvent('audioError', {
              detail: { 
                message: 'Audio playback requires user interaction. Please click anywhere on the page.',
                recoverable: true
              }
            }));
          }
        } else {
          throw startError;
        }
      }
    } catch (error) {
      this.audioPlaybackErrors++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown audio playback error';
      console.error('Error playing audio:', errorMessage);
      
      // Emit error event for UI feedback
      this.dispatchEvent(new CustomEvent('audioError', {
        detail: { 
          message: `Audio playback error: ${errorMessage}`,
          recoverable: this.audioPlaybackErrors < this.maxAudioPlaybackErrors
        }
      }));
      
      // If too many errors, disable audio playback but continue with transcripts
      if (this.audioPlaybackErrors >= this.maxAudioPlaybackErrors) {
        console.warn('Disabling audio playback due to repeated errors. Continuing with text transcripts only.');
      }
    }
  }

  /**
   * Stop all audio playback immediately (for interruptions)
   */
  private stopAudioPlayback(): void {
    console.log(`Stopping ${this.audioQueue.length} audio sources`);
    
    // Stop all currently playing audio sources
    this.audioQueue.forEach(source => {
      try {
        source.stop();
      } catch {
        // Ignore errors if source is already stopped
      }
    });
    
    // Clear the queue
    this.audioQueue = [];
    
    // Reset playback timing
    this.nextPlayTime = this.audioContext?.currentTime || 0;
    
    // Emit speaking stopped event
    this.dispatchEvent(new CustomEvent('speaking', { detail: { speaking: false } }));
  }

  /**
   * Stop voice session immediately
   */
  async stop(): Promise<VoiceSessionResult> {
    return new Promise((resolve) => {
      if (!this.ws || !this.isActive) {
        resolve({ transcripts: { user: [], assistant: [] } });
        return;
      }

      // Mark as intentionally stopping to prevent reconnection
      this.isIntentionallyStopping = true;
      
      // Clear reconnect timer if pending
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Listen for session_complete before closing
      const completeHandler = (event: Event) => {
        const customEvent = event as CustomEvent;
        resolve({ transcripts: customEvent.detail.transcripts });
        this.removeEventListener('complete', completeHandler);
      };
      this.addEventListener('complete', completeHandler);

      // Send stop message if WebSocket is still open
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'stop' }));
        } catch (error) {
          console.error('Error sending stop message:', error);
        }
      }
      
      // Stop audio immediately
      this.stopAudioPlayback();
      
      this.isActive = false;
      
      // Cleanup after short delay to allow final messages
      setTimeout(() => {
        this.cleanup();
      }, 500);
    });
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Disconnect audio processing node first
    if (this.audioWorkletNode) {
      try {
        this.audioWorkletNode.disconnect();
      } catch (error) {
        // Ignore errors if already disconnected
        console.warn('Error disconnecting audioWorkletNode:', error);
      }
      this.audioWorkletNode = null;
    }

    // Stop microphone
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Close audio context (must be done after disconnecting nodes)
    if (this.audioContext) {
      try {
        // Check if context is not already closed
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
      } catch (error) {
        console.warn('Error closing audio context:', error);
      }
      this.audioContext = null;
    }

    // Close WebSocket
    if (this.ws) {
      // Remove event listeners to prevent reconnection attempts
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.isActive = false;
    this.audioQueue = [];
    this.reconnectAttempts = 0;
    this.conversationHistory = [];
    this.startPromiseResolve = null;
    this.startPromiseReject = null;
    this.partialTranscripts = { user: [], assistant: [] };
    this.audioPlaybackErrors = 0;
  }

  /**
   * Check if session is active
   */
  isSessionActive(): boolean {
    return this.isActive;
  }

  /**
   * Check WebSocket connection state
   */
  getConnectionState(): 'connecting' | 'open' | 'closing' | 'closed' | null {
    if (!this.ws) return null;
    const states = ['connecting', 'open', 'closing', 'closed'];
    return states[this.ws.readyState] as 'connecting' | 'open' | 'closing' | 'closed';
  }

  /**
   * Check if currently reconnecting
   */
  isReconnecting(): boolean {
    return this.reconnectTimer !== null;
  }

  /**
   * Clear conversation history (useful when chat is cleared)
   * This ensures no old history bleeds into new conversations
   */
  clearConversationHistory(): void {
    this.conversationHistory = [];
  }
}

// Export singleton instance
export const voiceService = new VoiceService();
