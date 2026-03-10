"use client";

import { useState, useEffect } from "react";

interface ConversationContextViewProps {
  isDark: boolean;
  conversationId: string;
}

interface ContextData {
  summaryPresent: boolean;
  cachedContentUsed: boolean;
  toolMemoryState: string;
  estimatedTokens: number;
}

interface ConversationData {
  meta: {
    userId: string;
    turnCount: number;
    startTime: number;
  };
  messages: Array<{
    toolsCalled: string[];
  }>;
  context: ContextData | null;
}

const CONTEXT_LAYERS = [
  { id: "system", label: "System Instruction", alwaysActive: true },
  { id: "tools", label: "Tool Definitions", alwaysActive: true },
  { id: "cache", label: "Cached Content", key: "cachedContentUsed" as const },
  { id: "summary", label: "Summary", key: "summaryPresent" as const },
  { id: "toolMemory", label: "Tool Memory", key: "toolMemoryState" as const },
  { id: "messages", label: "Recent Messages", alwaysActive: true },
  { id: "config", label: "Configuration", alwaysActive: true },
];

export default function ConversationContextView({
  isDark,
  conversationId,
}: ConversationContextViewProps) {
  const [data, setData] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/observability/data?type=conversation&id=${conversationId}`
        );
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch {
        // ignore
      }
      setLoading(false);
    }
    fetchData();
  }, [conversationId]);

  const border = isDark ? "border-gray-800" : "border-gray-200";
  const cardBg = isDark ? "bg-gray-900/50" : "bg-gray-50";
  const muted = isDark ? "text-gray-500" : "text-gray-400";

  if (loading) {
    return (
      <div className={`font-mono text-xs ${muted} text-center py-4`}>
        Loading context...
      </div>
    );
  }

  if (!data) return null;

  const context = data.context;
  const allTools = data.messages.flatMap((m) => m.toolsCalled);
  const uniqueTools = [...new Set(allTools)];

  function isLayerActive(layer: (typeof CONTEXT_LAYERS)[number]): boolean {
    if (layer.alwaysActive) return true;
    if (!context) return false;
    if (layer.key === "toolMemoryState") return !!context.toolMemoryState;
    if (layer.key) return !!context[layer.key];
    return false;
  }

  return (
    <div className={`border ${border} ${cardBg} p-4`}>
      <h3 className={`font-mono text-xs ${muted} mb-3`}>
        Context for conversation {conversationId.slice(0, 8)}...
      </h3>

      {/* Layer indicators */}
      <div className="space-y-1.5 mb-4">
        {CONTEXT_LAYERS.map((layer) => {
          const active = isLayerActive(layer);
          return (
            <div
              key={layer.id}
              className={`flex items-center gap-3 font-mono text-xs px-3 py-1.5 border ${
                active
                  ? isDark
                    ? "border-gray-600 text-white"
                    : "border-gray-400 text-black"
                  : isDark
                    ? "border-gray-800 text-gray-700"
                    : "border-gray-100 text-gray-300"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  active
                    ? isDark
                      ? "bg-green-500"
                      : "bg-green-600"
                    : isDark
                      ? "bg-gray-700"
                      : "bg-gray-300"
                }`}
              />
              <span>{layer.label}</span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className={`flex flex-wrap gap-4 font-mono text-[0.65rem] ${muted}`}>
        <span>{data.meta.turnCount} turns</span>
        {context && <span>~{context.estimatedTokens} tokens</span>}
        {uniqueTools.length > 0 && (
          <span>Tools: {uniqueTools.join(", ")}</span>
        )}
      </div>
    </div>
  );
}
