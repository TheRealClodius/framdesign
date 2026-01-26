/**
 * Message processing utilities
 */

import { MESSAGE_LIMITS } from "./constants";
import type { Message } from "./storage";

/**
 * Prepare messages for sending to API (remove streaming, limit count, extract role/content)
 * Also filters out any assistant messages that appear before the first user message,
 * since the Gemini API requires conversations to start with a user message.
 */
export function prepareMessagesForSend(
  messages: Message[]
): Array<{ role: string; content: string }> {
  const filtered = messages.filter((m) => !m.streaming);

  // Find the index of the first user message
  const firstUserIndex = filtered.findIndex((m) => m.role === "user");

  // If there are assistant messages before the first user message, skip them
  // This handles the initial greeting message case
  const messagesFromFirstUser = firstUserIndex > 0
    ? filtered.slice(firstUserIndex)
    : filtered;

  return messagesFromFirstUser
    .slice(-MESSAGE_LIMITS.MAX_SENT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
}
