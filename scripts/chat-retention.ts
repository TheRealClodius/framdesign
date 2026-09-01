#!/usr/bin/env tsx

import "dotenv/config";
import { listRetainedTextChatMessages } from "../lib/services/chat-retention-service";

type ConversationView = {
  conversationId: string;
  visitorIdHash: string | null;
  startedAt: string;
  lastMessageAt: string;
  messages: Array<{
    messageId: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
};

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseSince(value: string | undefined): number | null {
  if (!value) return null;
  const relative = value.match(/^(\d+)([hdw])$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = relative[2].toLowerCase() === "h"
      ? 60 * 60 * 1000
      : relative[2].toLowerCase() === "d"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
    return Date.now() - amount * unitMs;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid --since value: ${value}. Use an ISO date or a value such as 24h, 7d, or 4w.`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const command = process.argv[2] || "list";
  const conversationFilter = command === "show" ? process.argv[3] : argument("--conversation");
  const since = parseSince(argument("--since"));
  const limit = Math.max(1, Number(argument("--limit") || "100"));
  const json = process.argv.includes("--json");

  let messages = await listRetainedTextChatMessages();
  if (since !== null) {
    messages = messages.filter((message) => Date.parse(message.createdAt) >= since);
  }
  if (conversationFilter) {
    messages = messages.filter((message) => message.conversationId === conversationFilter);
  }

  const grouped = new Map<string, ConversationView>();
  for (const message of messages) {
    const existing = grouped.get(message.conversationId);
    const compactMessage = {
      messageId: message.messageId,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    };
    if (existing) {
      existing.messages.push(compactMessage);
      existing.lastMessageAt = message.createdAt;
    } else {
      grouped.set(message.conversationId, {
        conversationId: message.conversationId,
        visitorIdHash: message.visitorIdHash,
        startedAt: message.createdAt,
        lastMessageAt: message.createdAt,
        messages: [compactMessage],
      });
    }
  }

  const conversations = [...grouped.values()]
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    .slice(0, limit);

  if (json) {
    process.stdout.write(`${JSON.stringify(conversations, null, 2)}\n`);
    return;
  }

  if (command === "show") {
    const conversation = conversations[0];
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationFilter || "(missing ID)"}`);
    }
    process.stdout.write(`Conversation ${conversation.conversationId}\n`);
    process.stdout.write(`Started ${conversation.startedAt}; last message ${conversation.lastMessageAt}\n\n`);
    for (const message of conversation.messages) {
      process.stdout.write(`[${message.createdAt}] ${message.role.toUpperCase()}\n${message.content}\n\n`);
    }
    return;
  }

  if (conversations.length === 0) {
    process.stdout.write("No retained text conversations found.\n");
    return;
  }
  for (const conversation of conversations) {
    process.stdout.write(
      `${conversation.lastMessageAt}  ${conversation.conversationId}  ${conversation.messages.length} messages\n`
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Chat retention query failed: ${message}\n`);
  process.exitCode = 1;
});
