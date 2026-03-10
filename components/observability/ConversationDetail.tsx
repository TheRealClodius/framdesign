"use client";

import { useState, useEffect } from "react";

interface ConversationDetailProps {
  isDark: boolean;
  conversationId: string;
  onClose: () => void;
}

interface ConversationTurn {
  userMessage: string;
  toolsCalled: string[];
  timestamp: number;
}

interface ConversationData {
  meta: {
    userId: string;
    startTime: number;
    lastActivity: number;
    turnCount: number;
    firstMessage: string;
  };
  messages: ConversationTurn[];
  context: {
    summaryPresent: boolean;
    cachedContentUsed: boolean;
    toolMemoryState: string;
    estimatedTokens: number;
  } | null;
}

export default function ConversationDetail({
  isDark,
  conversationId,
  onClose,
}: ConversationDetailProps) {
  const [data, setData] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetail() {
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
    fetchDetail();
  }, [conversationId]);

  const border = isDark ? "border-gray-800" : "border-gray-200";
  const cardBg = isDark ? "bg-gray-900/50" : "bg-gray-50";
  const muted = isDark ? "text-gray-500" : "text-gray-400";
  const subtle = isDark ? "text-gray-400" : "text-gray-500";

  if (loading) {
    return (
      <div className={`border ${border} ${cardBg} p-4`}>
        <div className={`font-mono text-xs ${muted} text-center py-4`}>
          Loading...
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className={`border ${border} ${cardBg} p-4`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`font-mono text-xs ${muted}`}>
          Conversation Detail
        </h3>
        <button
          onClick={onClose}
          className={`font-mono text-xs ${muted} hover:opacity-70`}
        >
          close
        </button>
      </div>

      {/* Meta */}
      <div className={`flex gap-6 mb-4 font-mono text-xs ${subtle}`}>
        <span>User: {data.meta.userId.slice(0, 16)}...</span>
        <span>Turns: {data.meta.turnCount}</span>
        <span>
          Started:{" "}
          {new Date(data.meta.startTime).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Context info */}
      {data.context && (
        <div
          className={`flex gap-4 mb-4 font-mono text-[0.65rem] ${muted}`}
        >
          <span>
            Summary: {data.context.summaryPresent ? "yes" : "no"}
          </span>
          <span>
            Cache: {data.context.cachedContentUsed ? "hit" : "miss"}
          </span>
          <span>~{data.context.estimatedTokens} tokens</span>
        </div>
      )}

      {/* Messages */}
      <div className="space-y-2">
        {data.messages.map((msg, i) => (
          <div
            key={i}
            className={`px-3 py-2 border-l-2 ${
              isDark ? "border-gray-700" : "border-gray-300"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className={`font-mono text-xs ${muted} shrink-0 w-14`}>
                {new Date(msg.timestamp).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="font-mono text-xs flex-1">
                {msg.userMessage}
              </span>
            </div>
            {msg.toolsCalled.length > 0 && (
              <div className={`mt-1 ml-[4.25rem] font-mono text-[0.65rem] ${muted}`}>
                tools: {msg.toolsCalled.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
