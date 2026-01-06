"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "HELLO. HOW CAN I HELP YOU TODAY?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch response");
      }

      const data = await response.json();
      
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message || "ERROR: COULD NOT GET RESPONSE." }
      ]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "ERROR: SOMETHING WENT WRONG. PLEASE TRY AGAIN." }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="w-full max-w-[28rem] mx-auto px-4 py-20">
      <div className="mb-10 text-center">
        <p className="text-[0.75rem] font-mono text-gray-500 tracking-wider">AI ASSISTANT</p>
      </div>

      <div className="flex flex-col h-[500px] font-mono text-[0.875rem]">
        <div className="flex-1 overflow-y-auto mb-6 space-y-6 scrollbar-hide">
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
                  {message.role === "user" ? "You" : "AI"}
                </p>
                <p className="text-black leading-relaxed">
                  {message.content}
                </p>
              </div>
            </div>
          ))}
          {isLoading && (
             <div className="flex justify-start">
               <div className="max-w-[85%] text-left">
                 <p className="uppercase text-[0.75rem] text-gray-400 mb-1 tracking-wider">AI</p>
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

        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="w-full bg-transparent border-b border-gray-300 py-2 pr-12 focus:border-black focus:outline-none transition-colors rounded-none placeholder:text-gray-300 text-black"
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
      </div>
    </section>
  );
}
