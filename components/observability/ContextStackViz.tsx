"use client";

import { useState } from "react";

interface ContextStackVizProps {
  isDark: boolean;
}

interface Layer {
  id: string;
  title: string;
  details: string[];
}

const CONTEXT_LAYERS: Layer[] = [
  {
    id: "system",
    title: "System Instruction",
    details: [
      "core.md — personality, behavior rules, response format",
      "Tool guides (7 tools) — inline usage instructions",
      "Date/time context injection",
    ],
  },
  {
    id: "tools",
    title: "Tool Definitions",
    details: [
      "kb_search — semantic search across knowledge base",
      "kb_get — retrieve specific KB entity by ID",
      "perplexity_search — external web search",
      "send_email — contact form via Resend",
      "start_voice_session — switch to voice mode",
      "ignore_user — decline inappropriate requests",
      "end_voice_session — return to text mode",
    ],
  },
  {
    id: "cache",
    title: "Cached Content (TTL: 1hr)",
    details: [
      "System prompt cache — avoids re-sending large instruction",
      "Conversation cache — reuses context for returning users",
      "LRU eviction — max 200 conversation cache entries",
    ],
  },
  {
    id: "conversation",
    title: "Conversation Context",
    details: [
      "Summary — generated when conversation > 20 messages",
      "Tool Memory — past tool calls/results for dedup",
      "Timeout Context — injected when user was blocked",
      "Card Context — active project card state",
      "Recent Messages — last ≤20 with timestamps",
    ],
  },
  {
    id: "config",
    title: "Configuration",
    details: [
      "Safety: BLOCK_ONLY_HIGH (all categories)",
      "Token Budget: 30,000 max per request",
      "Message Window: 20 recent messages",
      "Chain Limit: 5 consecutive tool calls",
      "Global Budget: 300,000 tokens per user",
    ],
  },
];

export default function ContextStackViz({ isDark }: ContextStackVizProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const border = isDark ? "border-gray-700" : "border-gray-300";
  const outerBorder = isDark ? "border-gray-600" : "border-gray-400";
  const muted = isDark ? "text-gray-500" : "text-gray-400";
  const subtle = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <div>
      <h3 className={`font-mono text-xs ${muted} mb-3`}>
        Agent Context Stack
      </h3>

      {/* Outer model container */}
      <div className={`border ${outerBorder} p-4 font-mono text-xs`}>
        <div className={`${subtle} mb-3`}>GEMINI 2.5 FLASH</div>

        <div className="space-y-2">
          {CONTEXT_LAYERS.map((layer) => {
            const isExpanded = expanded.has(layer.id);
            return (
              <div key={layer.id} className={`border ${border}`}>
                <button
                  onClick={() => toggle(layer.id)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors duration-200 ${
                    isDark ? "hover:bg-gray-800/50" : "hover:bg-gray-50"
                  }`}
                >
                  <span>{layer.title}</span>
                  <span className={muted}>{isExpanded ? "−" : "+"}</span>
                </button>

                {isExpanded && (
                  <div
                    className={`px-3 pb-2 space-y-1 ${subtle} text-[0.65rem]`}
                  >
                    {layer.details.map((d, i) => (
                      <div key={i}>· {d}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
