/**
 * Message processing utilities
 */

import { MESSAGE_LIMITS } from "./constants";
import type { Message } from "./storage";

/**
 * Prepare messages for sending to API (remove streaming, limit count, extract role/content)
 */
export function prepareMessagesForSend(
  messages: Message[]
): Array<{ role: string; content: string }> {
  return messages
    .filter((m) => !m.streaming)
    .slice(-MESSAGE_LIMITS.MAX_SENT_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }));
}
