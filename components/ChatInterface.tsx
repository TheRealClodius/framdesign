"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const TIMEOUT_STORAGE_KEY = "fram_timeout_until";
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
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
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
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `ERROR: ${errorMessage}. PLEASE TRY AGAIN.` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="w-full max-w-[28rem] mx-auto px-4 pt-12 pb-9">
      <div className="mb-10 text-center">
        <p className="text-[0.75rem] font-mono text-gray-500 tracking-wider">FRAM ASSISTANT</p>
      </div>

      <div className="flex flex-col h-[500px] font-mono text-[0.875rem]">
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto mb-6 space-y-6 scrollbar-hide">
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
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        code: ({ children }) => (
                          <code className="bg-gray-100 px-1 py-0.5 rounded text-[0.875rem] font-mono">
                            {children}
                          </code>
                        ),
                        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-gray-300 pl-3 italic my-2">
                            {children}
                          </blockquote>
                        ),
                        h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-4 border border-gray-300 rounded">
                            <table className="min-w-full divide-y divide-gray-300 text-[0.875rem]">
                                {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
                        tbody: ({ children }) => <tbody className="divide-y divide-gray-200 bg-white">{children}</tbody>,
                        tr: ({ children }) => <tr>{children}</tr>,
                        th: ({ children }) => (
                          <th scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-900 uppercase tracking-wider border-r last:border-r-0 border-gray-200">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => (
                          <td className="px-3 py-2 whitespace-normal text-black align-top border-r last:border-r-0 border-gray-200">
                            {children}
                          </td>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
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
          <div className="text-center py-4 border-t border-gray-200">
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
          <form onSubmit={handleSubmit} className="relative">
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
