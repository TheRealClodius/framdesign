/**
 * Best-effort GA4 events when NEXT_PUBLIC_GA_MEASUREMENT_ID is set (@next/third-parties/google injects gtag).
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackChatEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params ?? {});
}
