"use client";

import { useState, useEffect } from "react";
import ConversationDetail from "./ConversationDetail";

interface AnalyticsOverviewProps {
  isDark: boolean;
  onConversationSelect: (convId: string) => void;
}

interface AnalyticsData {
  sessionsOverTime: Array<{ date: string; sessions: number }>;
  topCountries: Array<{ country: string; sessions: number }>;
  totalPageViews: number;
  activeUsers: number;
}

interface ConversationItem {
  id: string;
  userId: string;
  startTime: number;
  lastActivity: number;
  turnCount: number;
  firstMessage: string;
}

interface StatsData {
  totalConversations: number;
  avgTurnCount: number;
  voiceSessions: number;
}

export default function AnalyticsOverview({
  isDark,
  onConversationSelect,
}: AnalyticsOverviewProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [analyticsRes, convsRes, statsRes] = await Promise.allSettled([
        fetch("/api/observability/analytics").then((r) => r.json()),
        fetch("/api/observability/data?type=conversations&limit=30").then((r) =>
          r.json()
        ),
        fetch("/api/observability/data?type=stats").then((r) => r.json()),
      ]);

      if (analyticsRes.status === "fulfilled" && analyticsRes.value.success) {
        setAnalytics(analyticsRes.value.data);
      } else {
        setAnalyticsError(true);
      }

      if (convsRes.status === "fulfilled" && convsRes.value.success) {
        setConversations(convsRes.value.data.conversations);
      }

      if (statsRes.status === "fulfilled" && statsRes.value.success) {
        setStats(statsRes.value.data);
      }

      setLoading(false);
    }
    fetchData();
  }, []);

  const border = isDark ? "border-gray-800" : "border-gray-200";
  const cardBg = isDark ? "bg-gray-900/50" : "bg-gray-50";
  const muted = isDark ? "text-gray-500" : "text-gray-400";
  const subtle = isDark ? "text-gray-400" : "text-gray-500";

  if (loading) {
    return (
      <div className={`font-mono text-xs ${muted} py-12 text-center`}>
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Users (30d)"
          value={analytics?.activeUsers ?? "—"}
          isDark={isDark}
        />
        <StatCard
          label="Conversations"
          value={stats?.totalConversations ?? "—"}
          isDark={isDark}
        />
        <StatCard
          label="Avg Turns"
          value={stats?.avgTurnCount ?? "—"}
          isDark={isDark}
        />
        <StatCard
          label="Voice Sessions"
          value={stats?.voiceSessions ?? "—"}
          isDark={isDark}
        />
      </div>

      {/* Sessions chart + Geography */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sessions over time */}
        <div className={`md:col-span-2 border ${border} ${cardBg} p-4`}>
          <h3 className={`font-mono text-xs ${muted} mb-3`}>
            Sessions (30 days)
          </h3>
          {analytics && !analyticsError ? (
            <SessionsChart data={analytics.sessionsOverTime} isDark={isDark} />
          ) : (
            <div className={`font-mono text-xs ${muted} py-8 text-center`}>
              {analyticsError
                ? "GA4 not configured"
                : "No data"}
            </div>
          )}
        </div>

        {/* Geography */}
        <div className={`border ${border} ${cardBg} p-4`}>
          <h3 className={`font-mono text-xs ${muted} mb-3`}>
            Top Countries
          </h3>
          {analytics && !analyticsError ? (
            <ul className="space-y-1.5">
              {analytics.topCountries.map((c) => (
                <li
                  key={c.country}
                  className="flex justify-between font-mono text-xs"
                >
                  <span className={subtle}>{c.country}</span>
                  <span>{c.sessions}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className={`font-mono text-xs ${muted} py-8 text-center`}>
              {analyticsError ? "GA4 not configured" : "No data"}
            </div>
          )}
        </div>
      </div>

      {/* Recent conversations */}
      <div className={`border ${border} ${cardBg} p-4`}>
        <h3 className={`font-mono text-xs ${muted} mb-3`}>
          Recent Conversations
        </h3>
        {conversations.length > 0 ? (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv.id)}
                className={`w-full text-left px-3 py-2 font-mono text-xs flex items-center gap-4 transition-colors duration-200 ${
                  selectedConv === conv.id
                    ? isDark
                      ? "bg-gray-800"
                      : "bg-gray-100"
                    : isDark
                      ? "hover:bg-gray-800/50"
                      : "hover:bg-gray-100/50"
                }`}
              >
                <span className={`${muted} shrink-0 w-28`}>
                  {new Date(conv.startTime).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className={`${subtle} shrink-0 w-16`}>
                  {conv.turnCount} turn{conv.turnCount !== 1 ? "s" : ""}
                </span>
                <span className="truncate">
                  {conv.firstMessage || "(empty)"}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onConversationSelect(conv.id);
                  }}
                  className={`ml-auto shrink-0 ${
                    isDark
                      ? "text-blue-400 hover:text-blue-300"
                      : "text-blue-600 hover:text-blue-500"
                  }`}
                >
                  context →
                </button>
              </button>
            ))}
          </div>
        ) : (
          <div className={`font-mono text-xs ${muted} py-8 text-center`}>
            No conversations yet
          </div>
        )}
      </div>

      {/* Conversation detail panel */}
      {selectedConv && (
        <ConversationDetail
          isDark={isDark}
          conversationId={selectedConv}
          onClose={() => setSelectedConv(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string | number;
  isDark: boolean;
}) {
  const border = isDark ? "border-gray-800" : "border-gray-200";
  const cardBg = isDark ? "bg-gray-900/50" : "bg-gray-50";
  const muted = isDark ? "text-gray-500" : "text-gray-400";

  return (
    <div className={`border ${border} ${cardBg} p-4`}>
      <div className={`font-mono text-[0.65rem] ${muted} mb-1`}>{label}</div>
      <div className="font-serif text-2xl font-light">{value}</div>
    </div>
  );
}

function SessionsChart({
  data,
  isDark,
}: {
  data: Array<{ date: string; sessions: number }>;
  isDark: boolean;
}) {
  if (data.length === 0) return null;

  const maxSessions = Math.max(...data.map((d) => d.sessions), 1);
  const chartHeight = 120;
  const barWidth = Math.max(4, Math.min(16, 600 / data.length - 2));

  return (
    <div className="overflow-x-auto">
      <svg
        width={data.length * (barWidth + 2) + 20}
        height={chartHeight + 20}
        className="block"
      >
        {data.map((d, i) => {
          const barHeight = (d.sessions / maxSessions) * chartHeight;
          return (
            <g key={d.date}>
              <rect
                x={i * (barWidth + 2) + 10}
                y={chartHeight - barHeight}
                width={barWidth}
                height={barHeight}
                fill={isDark ? "#4B5563" : "#D1D5DB"}
                rx={1}
              >
                <title>
                  {d.date}: {d.sessions} sessions
                </title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
