"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/hooks/useTheme";

export default function ObservabilityLogin() {
  const theme = useTheme();
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isDark = theme === "dark";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/observability/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });

      if (res.ok) {
        router.push("/observability");
      } else {
        const data = await res.json();
        setError(data.error || "Authentication failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 ${
        isDark ? "bg-black" : "bg-white"
      }`}
    >
      <div className="w-full max-w-sm">
        <h1
          className={`font-serif text-2xl font-light text-center mb-8 ${
            isDark ? "text-white" : "text-black"
          }`}
        >
          FRAM Observability
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Passphrase"
            autoFocus
            className={`w-full px-4 py-3 font-mono text-sm rounded-none border outline-none transition-colors duration-300 ${
              isDark
                ? "bg-black text-white border-gray-700 focus:border-gray-500 placeholder:text-gray-600"
                : "bg-white text-black border-gray-200 focus:border-gray-400 placeholder:text-gray-400"
            }`}
          />

          {error && (
            <p className="font-mono text-xs text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !passphrase}
            className={`w-full py-3 font-mono text-sm transition-colors duration-300 disabled:opacity-40 ${
              isDark
                ? "bg-white text-black hover:bg-gray-200"
                : "bg-black text-white hover:bg-gray-800"
            }`}
          >
            {loading ? "..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
