"use client";

import { useEffect } from "react";
import Hero from "@/components/Hero";
import ChatInterface from "@/components/ChatInterface";
import { useTheme } from "@/lib/hooks/useTheme";

export default function Home() {
  const theme = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    // Scroll to top on page load/refresh
    window.scrollTo(0, 0);

    // Prevent scroll restoration
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-between bg-black overflow-x-hidden">
      <Hero />
      {/* Black spacer to cover safe area on mobile */}
      <div className="w-full bg-black safe-area-spacer" style={{ minHeight: '60px' }} />
      <div className={`w-full form-container md:h-[100vh] md:flex md:flex-col md:items-center relative overflow-x-hidden transition-colors duration-300 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
        <ChatInterface />
      </div>
    </main>
  );
}
