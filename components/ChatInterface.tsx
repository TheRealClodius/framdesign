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

type Message = {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

const TIMEOUT_STORAGE_KEY = "fram_timeout_until";
const MESSAGES_STORAGE_KEY = "fram_conversation";
const BLOCKED_MESSAGE = "Fram has decided not to respond to you anymore as you've been rude. Fram does not take shit from anybody.";

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "HELLO. HOW CAN I HELP YOU TODAY?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [timeoutUntil, setTimeoutUntil] = useState<number | null>(null);
  const [wasBlocked, setWasBlocked] = useState(false);
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
    const stored = localStorage.getItem(TIMEOUT_STORAGE_KEY);
    if (stored) {
      const until = parseInt(stored, 10);
      if (Date.now() < until) {
        setTimeoutUntil(until);
        setWasBlocked(true);
      } else {
        // Timeout has expired, clear it
        localStorage.removeItem(TIMEOUT_STORAGE_KEY);
        setWasBlocked(true); // Mark that there was a timeout, so we can detect expiration
      }
    }
  }, []);

  // Load conversation from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(MESSAGES_STORAGE_KEY);
    if (stored) {
      try {
        const parsedMessages = JSON.parse(stored);
        if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
          // Filter out streaming messages (they shouldn't be persisted)
          const validMessages = parsedMessages.filter((msg: Message) => !msg.streaming);
          if (validMessages.length > 0) {
            setMessages(validMessages);
          }
        }
      } catch (error) {
        console.error("Failed to parse stored messages:", error);
        localStorage.removeItem(MESSAGES_STORAGE_KEY);
      }
    }
  }, []);

  // Auto-save messages to localStorage on changes
  useEffect(() => {
    // Filter out streaming messages before saving
    const messagesToSave = messages.filter((msg) => !msg.streaming);
    if (messagesToSave.length > 0) {
      localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(messagesToSave));
    }
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Monitor timeout expiration
  useEffect(() => {
    if (timeoutUntil && Date.now() >= timeoutUntil && wasBlocked) {
      // Timeout expired naturally - clear it
      localStorage.removeItem(TIMEOUT_STORAGE_KEY);
      setTimeoutUntil(null);
      // Keep wasBlocked true so we can detect expiration on next message
    }
  }, [timeoutUntil, wasBlocked]);

  // Check if currently blocked by timeout
  const isBlocked = timeoutUntil !== null && Date.now() < timeoutUntil;
  
  // Detect if timeout just expired (was blocked, now not blocked)
  // This happens when wasBlocked is true but isBlocked is false
  const timeoutJustExpired = wasBlocked && !isBlocked;

  const resetTimeout = () => {
    localStorage.removeItem(TIMEOUT_STORAGE_KEY);
    setTimeoutUntil(null);
    setWasBlocked(false);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    // Check if user is timed out before sending
    if (isBlocked) {
      setInput("");
      return;
    }

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    // Check if timeout just expired - if so, pass that context to the API
    const expired = timeoutJustExpired;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }],
          timeoutExpired: expired || false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("API Error:", response.status, errorData);
        
        // Handle overloaded model error specifically
        if (response.status === 503 || errorData.error?.toLowerCase().includes("overloaded")) {
          throw new Error("The AI model is currently overloaded. Please try again in a moment.");
        }
        
        throw new Error(errorData.error || errorData.details || `Failed to fetch response: ${response.status}`);
      }

      // Check if response is streaming or JSON
      const contentType = response.headers.get('Content-Type');
      
      if (contentType?.includes('text/plain')) {
        // Streaming response - create placeholder message with streaming flag
        setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);
        
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        if (!reader) {
          throw new Error("No response body");
        }
        
        let firstChunk = true;
        let buffer = "";
        let lastUpdateTime = Date.now();
        let lastChunkTime = Date.now();
        const UPDATE_INTERVAL = 50; // Update UI every 50ms to reduce re-renders for long streams
        const STREAM_TIMEOUT = 60000; // 60 second timeout for streams
        const CHUNK_TIMEOUT = 30000; // 30 second timeout between chunks
        
        // Function to flush buffer to state
        const flushBuffer = () => {
          if (buffer) {
            const contentToAdd = buffer;
            buffer = "";
            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              // Create a NEW object to trigger React re-render
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: updated[lastIndex].content + contentToAdd,
                streaming: true,
              };
              return updated;
            });
            scrollToBottom();
          }
        };
        
        // Set up timeout to detect hanging streams
        const streamStartTime = Date.now();
        const timeoutId = setTimeout(() => {
          console.error("Stream timeout: No response received within", STREAM_TIMEOUT, "ms");
          reader.cancel();
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            const currentContent = updated[lastIndex].content;
            const newContent = currentContent.trim() === ""
              ? "ERROR: Stream timeout. The agent did not respond in time. Please try again."
              : currentContent + "\n\n[Stream timed out - response may be incomplete]";
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: newContent,
              streaming: false,
            };
            return updated;
          });
          setIsLoading(false);
        }, STREAM_TIMEOUT);
        
        try {
          while (true) {
            // Check for chunk timeout (stream might be hanging)
            const now = Date.now();
            if (now - lastChunkTime > CHUNK_TIMEOUT) {
              console.warn("Stream appears to be hanging - no chunks received for", CHUNK_TIMEOUT, "ms");
              // Don't cancel yet, but log a warning
            }
            
            const { done, value } = await reader.read();
            
            if (done) {
              clearTimeout(timeoutId);
              // Flush any remaining buffer before finishing
              flushBuffer();
              console.log("Stream completed successfully. Total time:", Date.now() - streamStartTime, "ms");
              break;
            }
            
            // Reset chunk timeout
            lastChunkTime = Date.now();
            
            const chunk = decoder.decode(value, { stream: true });
            
            if (!chunk) {
              console.warn("Received empty chunk");
              continue;
            }
            
            // Hide loading dots on first chunk
            if (firstChunk) {
              setIsLoading(false);
              firstChunk = false;
              console.log("First chunk received after", Date.now() - streamStartTime, "ms");
            }
            
            // Accumulate chunks in buffer
            buffer += chunk;
            
            // Throttle updates for long streams - only update UI every UPDATE_INTERVAL ms
            if (now - lastUpdateTime >= UPDATE_INTERVAL) {
              flushBuffer();
              lastUpdateTime = now;
            }
          }
          
          // Ensure final buffer is flushed
          flushBuffer();
          
          // Mark streaming as complete
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            updated[lastIndex] = {
              ...updated[lastIndex],
              streaming: false,
            };
            return updated;
          });
        } catch (streamError) {
          clearTimeout(timeoutId);
          console.error("Stream reading error:", streamError);
          const errorMessage = streamError instanceof Error ? streamError.message : "Streaming error";
          const errorStack = streamError instanceof Error ? streamError.stack : undefined;
          console.error("Stream error details:", { errorMessage, errorStack });
          
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            const currentContent = updated[lastIndex].content;
            const newContent = currentContent.trim() === ""
              ? `ERROR: ${errorMessage}. PLEASE TRY AGAIN.`
              : currentContent + `\n\n[ERROR: ${errorMessage}]`;
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: newContent,
              streaming: false,
            };
            return updated;
          });
        } finally {
          clearTimeout(timeoutId);
          setIsLoading(false);
        }
      } else {
        // JSON response (timeout or error)
        const data = await response.json();
        
        // Check if Fram decided to timeout the user
        if (data.timeout) {
          const { until } = data.timeout;
          localStorage.setItem(TIMEOUT_STORAGE_KEY, until.toString());
          setTimeoutUntil(until);
          setWasBlocked(true);
        } else if (expired) {
          // Timeout expired and user sent a message - reset the flag
          setWasBlocked(false);
        }
        
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message || data.error || "ERROR: COULD NOT GET RESPONSE." }
        ]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error("Chat error details:", { errorMessage, errorStack, error });
      
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `ERROR: ${errorMessage}. PLEASE TRY AGAIN.` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="w-full max-w-[28rem] md:max-w-[950px] mx-auto px-4 pt-12 pb-9 h-fit md:flex-1 md:flex md:flex-col md:min-h-0">
      <div className="mb-10 text-center flex-shrink-0">
        <p className="text-[0.75rem] font-mono text-gray-500 tracking-wider">FRAM ASSISTANT</p>
      </div>

      <div className="flex flex-col h-[600px] md:flex-1 md:min-h-0 font-mono text-[0.875rem]">
        <div ref={messagesContainerRef} className="h-[600px] md:flex-1 md:min-h-0 overflow-y-auto mb-2 space-y-6 scrollbar-boxy">
          {messages.map((message, index) => (
            <div
              key={index}
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
                    <MarkdownWithMermaid content={message.content} isStreaming={message.streaming} />
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
              disabled={isLoading}
              className="w-full bg-transparent border-b border-gray-300 py-2 pr-12 focus:border-black focus:outline-none transition-colors rounded-none placeholder:text-gray-300 text-black resize-none overflow-y-auto max-h-[120px]"
              placeholder="Type your message..."
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-0 top-2 text-[0.75rem] uppercase tracking-wider text-black disabled:text-gray-300 hover:text-gray-600 transition-colors"
            >
              Send
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
