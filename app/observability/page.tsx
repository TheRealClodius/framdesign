"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/hooks/useTheme";
import AnalyticsOverview from "@/components/observability/AnalyticsOverview";
import ContextStackViz from "@/components/observability/ContextStackViz";

type Tab = "topics" | "structure";

export default function ObservabilityDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("topics");

  const isDark = theme === "dark";

  async function handleLogout() {
    await fetch("/api/observability/auth", { method: "DELETE" });
    router.push("/observability/login");
  }

  return (
    <div
      className={`min-h-screen ${isDark ? "bg-black text-white" : "bg-white text-black"}`}
    >
      {/* Header */}
      <header
        className={`sticky top-0 z-10 border-b backdrop-blur-sm ${
          isDark
            ? "border-gray-800 bg-black/80"
            : "border-gray-200 bg-white/80"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-serif text-lg font-light tracking-wide">
            FRAM Observability
          </h1>

          <div className="flex items-center gap-6">
            {/* Tabs */}
            <nav className="flex gap-4 font-mono text-xs">
              <button
                onClick={() => setActiveTab("topics")}
                className={`pb-0.5 transition-colors duration-300 ${
                  activeTab === "topics"
                    ? isDark
                      ? "text-white border-b border-white"
                      : "text-black border-b border-black"
                    : isDark
                      ? "text-gray-500 hover:text-gray-300"
                      : "text-gray-400 hover:text-gray-600"
                }`}
              >
                Topics & Analytics
              </button>
              <button
                onClick={() => setActiveTab("structure")}
                className={`pb-0.5 transition-colors duration-300 ${
                  activeTab === "structure"
                    ? isDark
                      ? "text-white border-b border-white"
                      : "text-black border-b border-black"
                    : isDark
                      ? "text-gray-500 hover:text-gray-300"
                      : "text-gray-400 hover:text-gray-600"
                }`}
              >
                Agent Structure
              </button>
            </nav>

            <button
              onClick={handleLogout}
              className={`font-mono text-xs transition-colors duration-300 ${
                isDark
                  ? "text-gray-500 hover:text-gray-300"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === "topics" && (
          <AnalyticsOverview isDark={isDark} />
        )}
        {activeTab === "structure" && (
          <ContextStackViz isDark={isDark} />
        )}
      </main>
    </div>
  );
}
