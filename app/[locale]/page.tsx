"use client";

import { useEffect } from "react";
import Hero from "@/components/Hero";
import ChatInterface from "@/components/ChatInterface";

export default function Home() {
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
      <div className="w-full bg-white form-container md:h-[100vh] md:flex md:flex-col overflow-x-hidden">
        <ChatInterface />
        
        <footer className="w-full text-center pt-8 md:pt-0 pb-9 text-[10px] font-mono text-gray-500 footer-safe-area flex-shrink-0">
          <p>&copy; {new Date().getFullYear()} FRAM DESIGN. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
}
