"use client";

/**
 * CHAT SECTION COMPONENT
 * 
 * This component renders the chat interface section of the website, featuring:
 * - Interactive chat interface with user and assistant messages
 * - Streaming response support with real-time updates
 * - Markdown and Mermaid diagram rendering for assistant responses
 * - Timeout/blocking functionality for inappropriate user behavior
 * - Auto-scrolling message container
 * - Responsive design with mobile and desktop layouts
 * 
 * Location: components/ChatInterface.tsx
 * Used in: app/[locale]/page.tsx (main landing page, below hero section)
 * API Endpoint: /api/chat (handles chat requests and streaming responses)
 */
import { useState, useRef, useEffect } from "react";
import MarkdownWithMermaid from "./MarkdownWithMermaid";
import {
  generateMessageId,
  getTimeoutUntil,
  setTimeoutUntil,
  clearTimeout as clearTimeoutStorage,
  loadMessagesFromStorage,
  saveMessagesToStorage,
  clearChatHistory,
  type Message,
} from "@/lib/storage";
import {
  MESSAGE_LIMITS,
  BLOCKED_MESSAGE,
} from "@/lib/constants";
import {
  streamChatResponse,
  sendChatRequest,
} from "@/lib/services/chat-service";
import { OverloadedError } from "@/lib/errors";
import { voiceService } from "@/lib/services/voice-service";

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "initial-assistant", role: "assistant", content: "HELLO. HOW CAN I HELP YOU TODAY?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [timeoutUntil, setTimeoutUntilState] = useState<number | null>(null);
  const [wasBlocked, setWasBlocked] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string>("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [audioPlaybackDisabled, setAudioPlaybackDisabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Check localStorage for existing timeout on mount
  useEffect(() => {
    const until = getTimeoutUntil();
    if (until) {
      setTimeoutUntilState(until);
      setWasBlocked(true);
    } else {
      // Check if timeout expired (was set but now cleared)
      const hadTimeout = localStorage.getItem("fram_timeout_until");
      if (hadTimeout) {
        clearTimeoutStorage();
        setWasBlocked(true); // Mark that there was a timeout, so we can detect expiration
      }
    }
  }, []);

  // Load conversation from localStorage on mount
  useEffect(() => {
    const loadedMessages = loadMessagesFromStorage(MESSAGE_LIMITS.MAX_PERSISTED_MESSAGES);
    if (loadedMessages.length > 0) {
      setMessages(loadedMessages);
    }
  }, []);

  // Auto-save messages to localStorage on changes (debounced to reduce blocking during streaming)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveMessagesToStorage(messages, MESSAGE_LIMITS.MAX_PERSISTED_MESSAGES);
    }, 300); // Debounce for 300ms

    return () => clearTimeout(timeoutId);
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Setup voice service event listeners
  useEffect(() => {
    const handleTranscript = (event: Event) => {
      const customEvent = event as CustomEvent<{ role: 'user' | 'assistant'; text: string }>;
      const { role, text } = customEvent.detail;
      
      // Add transcript as a message immediately in the chat UI
      setMessages((prev) => [...prev, {
        id: generateMessageId(),
        role: role,
        content: text
      }]);
      
      // Also update transcript display for the voice session panel (for reference)
      setVoiceTranscript((prev) => {
        if (prev) {
          return `${prev}\n${role === 'user' ? 'You' : 'FRAM'}: ${text}`;
        }
        return `${role === 'user' ? 'You' : 'FRAM'}: ${text}`;
      });
    };

    const handleStarted = () => {
      setIsVoiceMode(true);
      setIsVoiceLoading(false);
      setIsReconnecting(false);
      setVoiceTranscript("");
      setVoiceError(null);
      setAudioPlaybackDisabled(false);
    };

    const handleComplete = async (event: Event) => {
      const customEvent = event as CustomEvent<{ transcripts: { user: Array<{ text: string; timestamp: number }>; assistant: Array<{ text: string; timestamp: number }> } }>;
      const { transcripts } = customEvent.detail;
      
      // Note: Transcripts are now added in real-time via handleTranscript
      // This event is just for cleanup and finalization
      // We don't add them to messages again to avoid duplicates
      
      console.log('Voice session complete. Total transcripts:', {
        user: transcripts.user.length,
        assistant: transcripts.assistant.length
      });
      
      // Reset voice state
      setIsVoiceMode(false);
      setIsVoiceLoading(false);
      setVoiceTranscript("");
      setIsReconnecting(false);
      setVoiceError(null);
      setAudioPlaybackDisabled(false);
    };

    const handleError = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        message: string; 
        originalError?: string;
        canRetry?: boolean;
        partialTranscripts?: { user: Array<{ text: string; timestamp: number }>; assistant: Array<{ text: string; timestamp: number }> };
      }>;
      const { message, canRetry } = customEvent.detail;
      
      console.error('Voice error:', message);
      setIsVoiceLoading(false);
      setIsReconnecting(false);
      setVoiceError(message);
      
      // Note: Partial transcripts are already added via handleTranscript in real-time
      // No need to add them again here
      
      // Show error message to user (only if not recoverable)
      if (!canRetry) {
        setIsVoiceMode(false);
        setVoiceTranscript("");
        setMessages((prev) => [
          ...prev,
          { 
            id: generateMessageId(), 
            role: "assistant", 
            content: `VOICE ERROR: ${message}. PLEASE TRY AGAIN OR USE TEXT CHAT.` 
          }
        ]);
      } else {
        // Keep voice mode active if we can retry
        setIsReconnecting(true);
        // Don't show error message in chat - it's shown in the error banner
      }
    };

    const handleReconnecting = (event: Event) => {
      const customEvent = event as CustomEvent<{ attempt: number; maxAttempts: number }>;
      setIsReconnecting(true);
      setVoiceError(`Reconnecting... (${customEvent.detail.attempt}/${customEvent.detail.maxAttempts})`);
    };

    const handleAudioError = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string; recoverable: boolean }>;
      console.warn('Audio playback error:', customEvent.detail.message);
      
      if (!customEvent.detail.recoverable) {
        setAudioPlaybackDisabled(true);
        setMessages((prev) => [
          ...prev,
          { 
            id: generateMessageId(), 
            role: "assistant", 
            content: `NOTE: AUDIO PLAYBACK DISABLED DUE TO FORMAT INCOMPATIBILITY. TRANSCRIPTS WILL STILL BE DISPLAYED.` 
          }
        ]);
      } else {
        // Recoverable error - show temporary message
        setVoiceError(customEvent.detail.message);
        setTimeout(() => setVoiceError(null), 5000);
      }
    };

    const handlePartialTranscripts = (event: Event) => {
      const customEvent = event as CustomEvent<{ transcripts: { user: Array<{ text: string; timestamp: number }>; assistant: Array<{ text: string; timestamp: number }> } }>;
      const { transcripts } = customEvent.detail;
      
      // Note: Partial transcripts are already added via handleTranscript in real-time
      // This event is just for logging/debugging purposes now
      console.log('Partial transcripts received:', {
        user: transcripts.user.length,
        assistant: transcripts.assistant.length
      });
    };

    const handleTimeout = async (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        durationSeconds: number; 
        timeoutUntil: number; 
        farewellMessage: string;
      }>;
      const { timeoutUntil, farewellMessage } = customEvent.detail;
      
      console.log('User has been timed out:', customEvent.detail);
      
      // Set timeout in localStorage
      setTimeoutUntil(timeoutUntil);
      setTimeoutUntilState(timeoutUntil);
      setWasBlocked(true);
      
      // Add farewell message to chat
      setMessages((prev) => [
        ...prev,
        { 
          id: generateMessageId(), 
          role: "assistant", 
          content: farewellMessage 
        }
      ]);
      
      // Stop voice session
      try {
        await voiceService.stop();
      } catch (error) {
        console.error('Error stopping voice session after timeout:', error);
      }
      
      // Reset voice UI state
      setIsVoiceMode(false);
      setIsVoiceLoading(false);
      setVoiceTranscript("");
      setIsReconnecting(false);
      setVoiceError(null);
    };

    const handleEndVoiceSession = async (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        reason: string; 
        closingMessage: string;
        textResponse?: string | null;
      }>;
      const { reason, closingMessage, textResponse } = customEvent.detail;
      
      console.log(`Voice session ended by agent. Reason: ${reason}`);
      
      // Add closing message to chat
      setMessages((prev) => [
        ...prev,
        { 
          id: generateMessageId(), 
          role: "assistant", 
          content: closingMessage 
        }
      ]);
      
      // If there's a full text response (agent's actual answer), add it as a separate message
      if (textResponse && textResponse.trim()) {
        setMessages((prev) => [
          ...prev,
          { 
            id: generateMessageId(), 
            role: "assistant", 
            content: textResponse 
          }
        ]);
      }
      
      // Stop voice session gracefully
      try {
        await voiceService.stop();
      } catch (error) {
        console.error('Error stopping voice session after agent ended it:', error);
      }
      
      // Reset voice UI state
      setIsVoiceMode(false);
      setIsVoiceLoading(false);
      setVoiceTranscript("");
      setIsReconnecting(false);
      setVoiceError(null);
    };

    voiceService.addEventListener('transcript', handleTranscript);
    voiceService.addEventListener('started', handleStarted);
    voiceService.addEventListener('complete', handleComplete);
    voiceService.addEventListener('error', handleError);
    voiceService.addEventListener('reconnecting', handleReconnecting);
    voiceService.addEventListener('audioError', handleAudioError);
    voiceService.addEventListener('partialTranscripts', handlePartialTranscripts);
    voiceService.addEventListener('timeout', handleTimeout);
    voiceService.addEventListener('endVoiceSession', handleEndVoiceSession);

    return () => {
      voiceService.removeEventListener('transcript', handleTranscript);
      voiceService.removeEventListener('started', handleStarted);
      voiceService.removeEventListener('complete', handleComplete);
      voiceService.removeEventListener('error', handleError);
      voiceService.removeEventListener('reconnecting', handleReconnecting);
      voiceService.removeEventListener('audioError', handleAudioError);
      voiceService.removeEventListener('partialTranscripts', handlePartialTranscripts);
      voiceService.removeEventListener('timeout', handleTimeout);
      voiceService.removeEventListener('endVoiceSession', handleEndVoiceSession);
      
      // Cleanup: Stop voice session if active when component unmounts
      if (voiceService.isSessionActive()) {
        voiceService.stop().catch((error) => {
          console.error('Error stopping voice session on unmount:', error);
        });
      }
    };
  }, []);

  // Monitor timeout expiration
  useEffect(() => {
    if (timeoutUntil && Date.now() >= timeoutUntil && wasBlocked) {
      // Timeout expired naturally - clear it
      clearTimeoutStorage();
      setTimeoutUntilState(null);
      // Keep wasBlocked true so we can detect expiration on next message
    }
  }, [timeoutUntil, wasBlocked]);

  // Check if currently blocked by timeout
  const isBlocked = timeoutUntil !== null && Date.now() < timeoutUntil;
  
  // Detect if timeout just expired (was blocked, now not blocked)
  // This happens when wasBlocked is true but isBlocked is false
  const timeoutJustExpired = wasBlocked && !isBlocked;

  const resetTimeout = () => {
    clearTimeoutStorage();
    setTimeoutUntilState(null);
    setWasBlocked(false);
  };

  const handleFixDiagram = async (
    messageIndex: number,
    error: { source: string; message: string; fullContent: string }
  ) => {
    if (isLoading) return; // Don't allow fixes while loading

    const messageToFix = messages[messageIndex];
    if (!messageToFix || messageToFix.role !== "assistant") return;

    setIsLoading(true);

    try {
      // Create a fix request that includes the error context
      const fixPrompt = `IMPORTANT: A MERMAID DIAGRAM IN YOUR PREVIOUS RESPONSE FAILED TO RENDER.

ERROR DETAILS:
${error.message}

FAILED MERMAID SOURCE CODE:
\`\`\`mermaid
${error.source}
\`\`\`

YOUR PREVIOUS RESPONSE (that contains the broken diagram):
${error.fullContent}

PLEASE FIX THE MERMAID DIAGRAM SYNTAX AND REGENERATE YOUR RESPONSE WITH THE CORRECTED DIAGRAM. Ensure the diagram follows valid Mermaid syntax and will render correctly.`;

      const fixMessages: Message[] = [
        ...messages.slice(0, messageIndex),
        { id: generateMessageId(), role: "user", content: fixPrompt }
      ];

      let fixedContent = "";

      await streamChatResponse(
        { messages: fixMessages, timeoutExpired: false },
        (chunk) => {
          fixedContent += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            updated[messageIndex] = {
              ...updated[messageIndex],
              content: fixedContent,
              streaming: true,
            };
            return updated;
          });
          scrollToBottom();
        },
          (error) => {
            console.error("Error fixing diagram:", error);
            const errorMessage = error.message;
            setMessages((prev) => {
              const updated = [...prev];
              updated[messageIndex] = {
                ...updated[messageIndex],
                content: updated[messageIndex].content + `\n\n[Error fixing diagram: ${errorMessage}]`,
              };
              return updated;
            });
          }
      );

      // Mark streaming as complete
      setMessages((prev) => {
        const updated = [...prev];
        updated[messageIndex] = {
          ...updated[messageIndex],
          content: fixedContent,
          streaming: false,
        };
        return updated;
      });
    } catch (error) {
      console.error("Error fixing diagram:", error);
      // Show error but don't update message
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // Add error indicator to the message
      setMessages((prev) => {
        const updated = [...prev];
        updated[messageIndex] = {
          ...updated[messageIndex],
          content: updated[messageIndex].content + `\n\n[Error fixing diagram: ${errorMessage}]`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || isVoiceMode) return;

    // Check if user is timed out before sending
    if (isBlocked) {
      setInput("");
      return;
    }

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { id: generateMessageId(), role: "user", content: userMessage }]);
    setIsLoading(true);

    // Check if timeout just expired - if so, pass that context to the API
    const expired = timeoutJustExpired;

    try {
      const requestMessages: Message[] = [
        ...messages,
        { id: generateMessageId(), role: "user", content: userMessage }
      ];

      // Create placeholder assistant message for streaming
      const assistantMessageId = generateMessageId();
      setMessages((prev) => [...prev, { id: assistantMessageId, role: "assistant", content: "", streaming: true }]);

      // Try streaming first
      let streamedContent = "";
      let streamCompleted = false;

      try {
        const response = await streamChatResponse(
          { messages: requestMessages, timeoutExpired: expired || false },
          (chunk) => {
            if (!streamCompleted) {
              streamedContent += chunk;
              setMessages((prev) => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
                  updated[lastIndex] = {
                    ...updated[lastIndex],
                    content: streamedContent,
                    streaming: true,
                  };
                }
                return updated;
              });
              scrollToBottom();
            }
          },
          (error) => {
            console.error("Stream error:", error);
            setIsLoading(false);
            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: error.message,
                  streaming: false,
                };
              }
              return updated;
            });
          }
        );

        streamCompleted = true;
        setIsLoading(false);

        // Check if response is JSON (tool call) and handle startVoiceSession
        if (response && response.startVoiceSession) {
          // Start voice session - same logic as voice button click
          try {
            setIsVoiceLoading(true);
            setVoiceTranscript("");
            
            // Prepare conversation history for context injection
            const conversationHistory = messages.map(m => ({
              role: m.role,
              content: m.content
            }));
            
            // Start voice session
            await voiceService.start(conversationHistory);
            // Session started event will update state
          } catch (error) {
            console.error('Error starting voice session:', error);
            setIsVoiceLoading(false);
            setVoiceError(error instanceof Error ? error.message : 'Failed to start voice session');
          }
        }

        // Check for timeout in response
        if (response && response.timeout) {
          const { until } = response.timeout;
          setTimeoutUntil(until);
          setTimeoutUntilState(until);
          setWasBlocked(true);
        } else if (expired) {
          // Timeout expired and user sent a message - reset the flag
          setWasBlocked(false);
        }

        // Mark streaming as complete
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: streamedContent,
              streaming: false,
            };
          }
          return updated;
        });
      } catch (streamError) {
        // If streaming fails, try JSON fallback
        if (streamError instanceof OverloadedError) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: `ERROR: ${streamError.message}. PLEASE TRY AGAIN.`,
                streaming: false,
              };
            }
            return updated;
          });
          return;
        }

        // Fallback to JSON request
        const data = await sendChatRequest({ messages: requestMessages, timeoutExpired: expired || false });

        // Check if Fram decided to timeout the user
        if (data.timeout) {
          const { until } = data.timeout;
          setTimeoutUntil(until);
          setTimeoutUntilState(until);
          setWasBlocked(true);
        } else if (expired) {
          // Timeout expired and user sent a message - reset the flag
          setWasBlocked(false);
        }

        // Check if Fram wants to start voice session
        if (data.startVoiceSession) {
          // Start voice session - same logic as voice button click
          try {
            setIsVoiceLoading(true);
            setVoiceTranscript("");
            
            // Prepare conversation history for context injection
            const conversationHistory = messages.map(m => ({
              role: m.role,
              content: m.content
            }));
            
            // Start voice session
            await voiceService.start(conversationHistory);
            // Session started event will update state
          } catch (error) {
            console.error('Error starting voice session:', error);
            setIsVoiceLoading(false);
            setVoiceError(error instanceof Error ? error.message : 'Failed to start voice session');
          }
        }

        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          if (lastIndex >= 0 && updated[lastIndex].id === assistantMessageId) {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: data.message || data.error || "ERROR: COULD NOT GET RESPONSE.",
              streaming: false,
            };
          }
          return updated;
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      setMessages((prev) => [
        ...prev,
        { id: generateMessageId(), role: "assistant", content: `ERROR: ${errorMessage}. PLEASE TRY AGAIN.` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (window.confirm("Are you sure you want to clear all chat history? This cannot be undone.")) {
      clearChatHistory();
      setMessages([
        { id: "initial-assistant", role: "assistant", content: "HELLO. HOW CAN I HELP YOU TODAY?" }
      ]);
    }
  };

  return (
    <section className="w-full max-w-[28rem] md:max-w-[950px] mx-auto px-4 pt-12 pb-9 h-fit md:flex-1 md:flex md:flex-col md:min-h-0">
      <div className="mb-10 text-center flex-shrink-0 flex items-center justify-center gap-4">
        <p className="text-[0.75rem] font-mono text-gray-500 tracking-wider">FRAM ASSISTANT</p>
        <button
          onClick={handleClearChat}
          className="text-[0.7rem] font-mono text-gray-400 hover:text-gray-600 uppercase tracking-wider transition-colors underline"
          title="Clear chat history"
        >
          Clear
        </button>
      </div>

      <div className="flex flex-col h-[600px] md:flex-1 md:min-h-0 font-mono text-[0.875rem]">
        <div ref={messagesContainerRef} className="h-[600px] md:flex-1 md:min-h-0 overflow-y-auto mb-2 space-y-6 scrollbar-boxy">
          {messages.map((message, index) => (
            <div
              key={message.id || index}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] ${
                  message.role === "user"
                    ? "text-right"
                    : "text-left"
                }`}
              >
                <p className="uppercase text-[0.75rem] text-gray-400 mb-1 tracking-wider">
                  {message.role === "user" ? "You" : "FRAM"}
                </p>
                {message.role === "assistant" ? (
                  <div className="text-black leading-relaxed">
                    <MarkdownWithMermaid 
                      content={message.content} 
                      isStreaming={message.streaming}
                      onFixDiagram={async (error) => {
                        await handleFixDiagram(index, error);
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-black leading-relaxed">
                    {message.content}
                  </p>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
             <div className="flex justify-start">
               <div className="max-w-[85%] text-left">
                 <p className="uppercase text-[0.75rem] text-gray-400 mb-1 tracking-wider">FRAM</p>
                 <div className="flex space-x-1 items-center h-6">
                   <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                   <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                   <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                 </div>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {isBlocked ? (
          <div className="text-center py-4 border-t border-gray-200 flex-shrink-0">
            <p className="text-gray-500 text-[0.8rem] leading-relaxed mb-3">
              {BLOCKED_MESSAGE}
            </p>
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={resetTimeout}
                className="text-[0.7rem] uppercase tracking-wider text-gray-400 hover:text-gray-600 underline"
              >
                Reset timeout (dev)
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="relative max-w-[500px] mx-auto w-full flex-shrink-0">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={isLoading || isVoiceMode}
              className="w-full bg-transparent border-b border-gray-300 py-2 pr-12 focus:border-black focus:outline-none transition-colors rounded-none placeholder:text-gray-300 text-black resize-none overflow-y-auto max-h-[120px] disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={isVoiceMode ? "Voice mode active..." : "Type your message..."}
            />
            <button
              type="submit"
              disabled={isLoading || isVoiceMode || !input.trim()}
              className="absolute right-0 top-2 text-[0.75rem] uppercase tracking-wider text-black disabled:text-gray-300 hover:text-gray-600 transition-colors"
            >
              Send
            </button>
          </form>
        )}
        
        {/* Voice Mode Controls */}
        {!isBlocked && (
          <div className="flex flex-col items-end mt-4 space-y-2">
            {/* Voice Transcript Display */}
            {isVoiceMode && voiceTranscript && (
              <div className="w-full max-w-[500px] mx-auto px-4 py-2 bg-gray-50 border border-gray-200 rounded text-[0.75rem] font-mono text-gray-600 max-h-[100px] overflow-y-auto">
                <p className="uppercase text-[0.7rem] text-gray-400 mb-1 tracking-wider">
                  Voice Session {isReconnecting && '(Reconnecting...)'}
                </p>
                <div className="whitespace-pre-wrap">{voiceTranscript}</div>
              </div>
            )}
            
            {/* Voice Error Display */}
            {voiceError && (
              <div className={`w-full max-w-[500px] mx-auto px-4 py-2 rounded text-[0.75rem] font-mono ${
                isReconnecting 
                  ? 'bg-yellow-50 border border-yellow-200 text-yellow-700' 
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                <p className="uppercase text-[0.7rem] mb-1 tracking-wider">
                  {isReconnecting ? 'Reconnecting' : 'Error'}
                </p>
                <div>{voiceError}</div>
              </div>
            )}
            
            {/* Audio Playback Disabled Notice */}
            {audioPlaybackDisabled && isVoiceMode && (
              <div className="w-full max-w-[500px] mx-auto px-4 py-2 bg-yellow-50 border border-yellow-200 rounded text-[0.75rem] font-mono text-yellow-700">
                <p className="uppercase text-[0.7rem] mb-1 tracking-wider">Audio Disabled</p>
                <div>Audio playback unavailable. Transcripts will still be displayed.</div>
              </div>
            )}
            
            {/* Voice Button */}
            <button
              onClick={async () => {
                if (isVoiceMode) {
                  // End voice mode
                  try {
                    await voiceService.stop();
                    // Transcripts will be integrated via the 'complete' event handler
                  } catch (error) {
                    console.error('Error stopping voice session:', error);
                    setIsVoiceMode(false);
                    setIsVoiceLoading(false);
                    setVoiceTranscript("");
                  }
                } else {
                  // Start voice mode
                  try {
                    setIsVoiceLoading(true);
                    setVoiceTranscript("");
                    
                    // Prepare conversation history for context injection
                    const conversationHistory = messages.map(m => ({
                      role: m.role,
                      content: m.content
                    }));
                    
                    // Start voice session
                    await voiceService.start(conversationHistory);
                    // Session started event will update state
                  } catch (error) {
                    console.error('Error starting voice session:', error);
                    setIsVoiceLoading(false);
                    setIsVoiceMode(false);
                    setVoiceTranscript("");
                    
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    let userFriendlyMessage = errorMessage;
                    
                    // Provide specific guidance based on error type
                    if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
                      userFriendlyMessage = 'Microphone permission denied. Please grant microphone access in your browser settings and try again.';
                    } else if (errorMessage.includes('WebSocket') || errorMessage.includes('connection')) {
                      userFriendlyMessage = 'Could not connect to voice server. Please check your internet connection and try again.';
                    } else if (errorMessage.includes('Invalid WebSocket URL')) {
                      userFriendlyMessage = 'Voice server not configured. Please contact support.';
                    }
                    
                    setMessages((prev) => [
                      ...prev,
                      { 
                        id: generateMessageId(), 
                        role: "assistant", 
                        content: `VOICE ERROR: ${userFriendlyMessage}. YOU CAN CONTINUE USING TEXT CHAT.` 
                      }
                    ]);
                  }
                }
              }}
              disabled={isVoiceLoading || isLoading}
              className={`text-[0.75rem] uppercase tracking-wider transition-colors ${
                isVoiceMode
                  ? "text-red-600 hover:text-red-700"
                  : "text-black hover:text-gray-600"
              } ${isVoiceLoading || isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isVoiceLoading ? (
                "Starting..."
              ) : isVoiceMode ? (
                "END"
              ) : (
                "VOICE"
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
