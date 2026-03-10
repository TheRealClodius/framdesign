export interface LoggedMessage {
  userId: string;
  message: string;
  toolsCalled: string[];
  timestamp: number;
}

// In-memory ring buffer — survives across requests within the same serverless instance
// Resets on cold starts / redeploys, which is fine for a lightweight analytics tool
const MAX_ENTRIES = 500;
const messages: LoggedMessage[] = [];

export function logMessage(userId: string, message: string, toolsCalled: string[]): void {
  messages.push({
    userId,
    message: message.slice(0, 200),
    toolsCalled,
    timestamp: Date.now(),
  });

  // Trim to ring buffer size
  if (messages.length > MAX_ENTRIES) {
    messages.splice(0, messages.length - MAX_ENTRIES);
  }
}

export function getRecentMessages(hours = 24): LoggedMessage[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return messages
    .filter(m => m.timestamp > cutoff)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function getMessageCount(): number {
  return messages.length;
}
