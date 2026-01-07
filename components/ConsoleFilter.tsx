"use client";

import { useEffect } from "react";

export default function ConsoleFilter() {
  useEffect(() => {
    // Suppress Next.js debug messages about params/searchParams when not used
    const originalDebug = console.debug;
    const originalError = console.error;
    
    console.debug = (...args: any[]) => {
      const message = args[0]?.toString() || "";
      // Filter out false positive warnings about params/searchParams
      if (
        message.includes("params are being enumerated") ||
        message.includes("searchParams") ||
        message.includes("must be unwrapped with React.use()")
      ) {
        return;
      }
      originalDebug.apply(console, args);
    };

    console.error = (...args: any[]) => {
      const message = args[0]?.toString() || "";
      // Filter out false positive errors about params/searchParams from React DevTools
      if (
        message.includes("params are being enumerated") ||
        (message.includes("searchParams") && message.includes("must be unwrapped with React.use()")) ||
        message.includes("The keys of `searchParams` were accessed directly")
      ) {
        return;
      }
      originalError.apply(console, args);
    };

    // Cleanup on unmount
    return () => {
      console.debug = originalDebug;
      console.error = originalError;
    };
  }, []);

  return null;
}
