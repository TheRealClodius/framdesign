"use client";

import { useState, useEffect } from "react";

interface AnalyticsOverviewProps {
  isDark: boolean;
}

interface AnalyticsData {
  sessionsOverTime: Array<{ date: string; sessions: number }>;
  topCountries: Array<{ country: string; sessions: number }>;
  totalPageViews: number;
  activeUsers: number;
}

interface TopicItem {
  topic: string;
  count: number;
  examples: string[];
}

interface TopicsData {
  topTopics: TopicItem[];
  patterns: string[];
  surprising: string[];
  totalMessages: number;
  analyzedAt: number;
}

interface RecentMessage {
  userId: string;
  message: string;
  toolsCalled: string[];
  timestamp: number;
}

export default function AnalyticsOverview({ isDark }: AnalyticsOverviewProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsError, setAnalyticsError] = useState(false);
  const [loading, setLoading] = useState(true);

  const [topics, setTopics] = useState<TopicsData | null>(null);
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      try {
        const res = await fetch("/api/observability/analytics");
        const data = await res.json();
        if (data.success) {
          setAnalytics(data.data);
        } else {
          setAnalyticsError(true);
        }
      } catch {
        setAnalyticsError(true);
      }
      setLoading(false);
    }
    fetchAnalytics();
  }, []);

  async function handleAnalyzeTopics() {
    setTopicsLoading(true);
    setTopicsError(null);
    try {
      const res = await fetch("/api/observability/topics");
      const data = await res.json();
      if (data.success) {
        setTopics(data.data);
        setRecentMessages(data.recentMessages || []);
      } else {
        setTopicsError(data.error || "Failed to analyze topics");
      }
    } catch {
      setTopicsError("Failed to fetch topics");
    }
    setTopicsLoading(false);
  }

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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="Active Users (30d)"
          value={analytics?.activeUsers ?? "—"}
          isDark={isDark}
        />
        <StatCard
          label="Page Views (30d)"
          value={analytics?.totalPageViews ?? "—"}
          isDark={isDark}
        />
        <StatCard
          label="Messages Analyzed"
          value={topics?.totalMessages ?? "—"}
          isDark={isDark}
        />
      </div>

      {/* Sessions chart + Geography */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`md:col-span-2 border ${border} ${cardBg} p-4`}>
          <h3 className={`font-mono text-xs ${muted} mb-3`}>
            Sessions (30 days)
          </h3>
          {analytics && !analyticsError ? (
            <SessionsChart data={analytics.sessionsOverTime} isDark={isDark} />
          ) : (
            <div className={`font-mono text-xs ${muted} py-8 text-center`}>
              {analyticsError ? "GA4 not configured" : "No data"}
            </div>
          )}
        </div>

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

      {/* Topic Analysis */}
      <div className={`border ${border} ${cardBg} p-4`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-mono text-xs ${muted}`}>
            Topic Analysis
          </h3>
          <button
            onClick={handleAnalyzeTopics}
            disabled={topicsLoading}
            className={`font-mono text-xs px-3 py-1.5 border transition-colors duration-200 ${
              isDark
                ? "border-gray-700 hover:border-gray-500 text-gray-300 disabled:text-gray-600"
                : "border-gray-300 hover:border-gray-500 text-gray-700 disabled:text-gray-400"
            }`}
          >
            {topicsLoading ? "Analyzing..." : "Analyze Topics"}
          </button>
        </div>

        {topicsError && (
          <div className="font-mono text-xs text-red-400 mb-3">{topicsError}</div>
        )}

        {topics && topics.topTopics.length > 0 ? (
          <div className="space-y-4">
            {/* Top topics */}
            <div>
              <h4 className={`font-mono text-[0.65rem] ${muted} mb-2 uppercase tracking-wider`}>
                Top Topics
              </h4>
              <div className="space-y-1.5">
                {topics.topTopics.map((t, i) => (
                  <div key={t.topic} className="flex items-start gap-3 font-mono text-xs">
                    <span className={`${muted} w-4 shrink-0 text-right`}>{i + 1}.</span>
                    <span className="font-medium">{t.topic}</span>
                    <span className={`${muted} shrink-0`}>({t.count})</span>
                    {t.examples.length > 0 && (
                      <span className={`${subtle} truncate`}>
                        — {t.examples[0]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Patterns */}
            {topics.patterns.length > 0 && (
              <div>
                <h4 className={`font-mono text-[0.65rem] ${muted} mb-2 uppercase tracking-wider`}>
                  Patterns
                </h4>
                <ul className="space-y-1">
                  {topics.patterns.map((p, i) => (
                    <li key={i} className={`font-mono text-xs ${subtle}`}>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Surprising */}
            {topics.surprising.length > 0 && (
              <div>
                <h4 className={`font-mono text-[0.65rem] ${muted} mb-2 uppercase tracking-wider`}>
                  Surprising Queries
                </h4>
                <ul className="space-y-1">
                  {topics.surprising.map((s, i) => (
                    <li key={i} className={`font-mono text-xs ${subtle}`}>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : !topicsLoading && !topics ? (
          <div className={`font-mono text-xs ${muted} py-6 text-center`}>
            Click &quot;Analyze Topics&quot; to fetch recent messages from Vercel logs and extract topics via Gemini.
          </div>
        ) : topics && topics.topTopics.length === 0 ? (
          <div className={`font-mono text-xs ${muted} py-6 text-center`}>
            No messages found in recent logs.
          </div>
        ) : null}
      </div>

      {/* Recent Messages */}
      {recentMessages.length > 0 && (
        <div className={`border ${border} ${cardBg} p-4`}>
          <h3 className={`font-mono text-xs ${muted} mb-3`}>
            Recent Messages
          </h3>
          <div className="space-y-1">
            {recentMessages.map((msg, i) => (
              <div
                key={i}
                className="flex items-center gap-4 font-mono text-xs py-1.5"
              >
                <span className={`${muted} shrink-0 w-28`}>
                  {new Date(msg.timestamp).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {msg.toolsCalled.length > 0 && (
                  <span className={`${muted} shrink-0`}>
                    [{msg.toolsCalled.length} tool{msg.toolsCalled.length !== 1 ? "s" : ""}]
                  </span>
                )}
                <span className="truncate">{msg.message}</span>
              </div>
            ))}
          </div>
        </div>
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
