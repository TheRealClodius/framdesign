import { describe, test, expect, afterEach } from "@jest/globals";
import { trackChatEvent } from "@/lib/chat-analytics";

describe("trackChatEvent", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  test("calls gtag when defined on window", () => {
    const gtag = jest.fn();
    Object.defineProperty(globalThis, "window", {
      value: { gtag },
      writable: true,
      configurable: true,
    });
    trackChatEvent("deep_link_opened", { link_type: "q" });
    expect(gtag).toHaveBeenCalledWith("event", "deep_link_opened", {
      link_type: "q",
    });
  });

  test("does not throw when gtag is missing", () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      writable: true,
      configurable: true,
    });
    expect(() => trackChatEvent("assistant_copy_clicked")).not.toThrow();
  });
});
