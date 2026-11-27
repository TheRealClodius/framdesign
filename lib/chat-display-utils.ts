/**
 * Shared helpers for rendering and exporting assistant chat content.
 */

import type { Message } from "@/lib/storage";

/**
 * Strip suggestions and metadata from message content for display or copy.
 * Handles inline `<suggestions>`, legacy ---SUGGESTIONS---, ---OBSERVABILITY---, ---HAS_QUESTION---.
 */
export function stripSuggestionsFromContent(content: string): string {
  if (!content) return content;

  let result = content;

  result = result.replace(/<suggestions>[\s\S]*?<\/suggestions>/g, "").trimEnd();

  const suggestionsMarker = "---SUGGESTIONS---";
  if (result.includes(suggestionsMarker)) {
    result = result.substring(0, result.indexOf(suggestionsMarker)).trimEnd();
  }

  const obsMarker = "---OBSERVABILITY---";
  if (result.includes(obsMarker)) {
    result = result.substring(0, result.indexOf(obsMarker)).trimEnd();
  }

  const questionMarker = "---HAS_QUESTION---";
  if (result.includes(questionMarker)) {
    result = result.substring(0, result.indexOf(questionMarker)).trimEnd();
  }

  return result.trimEnd();
}

/**
 * Plain text / markdown suitable for clipboard (Slack, Notion, email).
 */
export function buildAssistantCopyText(message: Message): string {
  const parts: string[] = [];
  const body = stripSuggestionsFromContent(message.content).trim();
  if (body) parts.push(body);
  if (message.images?.length) {
    parts.push(message.images.map((m) => m.trim()).filter(Boolean).join("\n\n"));
  }
  if (message.citations?.length) {
    const lines = message.citations.map((c) => {
      const label = (c.title || c.url).trim();
      return c.url ? `${label} — ${c.url}` : label;
    });
    parts.push(["Sources:", ...lines.map((l) => `- ${l}`)].join("\n"));
  }
  return parts.join("\n\n").trim();
}
