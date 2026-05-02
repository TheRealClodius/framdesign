import { describe, test, expect } from "@jest/globals";
import {
  stripSuggestionsFromContent,
  buildAssistantCopyText,
} from "@/lib/chat-display-utils";
import type { Message } from "@/lib/storage";

describe("stripSuggestionsFromContent", () => {
  test("removes inline suggestions block", () => {
    const raw =
      "Hello.\n\n<suggestions>[\"a\", \"b\"]</suggestions>";
    expect(stripSuggestionsFromContent(raw).trim()).toBe("Hello.");
  });

  test("removes legacy ---SUGGESTIONS--- payload", () => {
    const raw = 'Text here\n---SUGGESTIONS---{"suggestions":["x"]}';
    expect(stripSuggestionsFromContent(raw).trim()).toBe("Text here");
  });

  test("removes ---OBSERVABILITY--- tail", () => {
    const raw = "Visible\n---OBSERVABILITY---{}";
    expect(stripSuggestionsFromContent(raw).trim()).toBe("Visible");
  });
});

describe("buildAssistantCopyText", () => {
  test("combines body, images, and sources", () => {
    const message: Message = {
      id: "1",
      role: "assistant",
      content: "Intro\n\n<suggestions>[\"a\"]</suggestions>",
      images: ["![x](y.png)"],
      citations: [{ url: "https://example.com", title: "Example" }],
    };
    const out = buildAssistantCopyText(message);
    expect(out).toContain("Intro");
    expect(out).not.toContain("suggestions");
    expect(out).toContain("![x](y.png)");
    expect(out).toContain("Sources:");
    expect(out).toContain("example.com");
  });

  test("returns empty string when nothing to copy", () => {
    const message: Message = {
      id: "2",
      role: "assistant",
      content: "   \n<suggestions>[\"a\"]</suggestions>",
    };
    expect(buildAssistantCopyText(message)).toBe("");
  });
});
