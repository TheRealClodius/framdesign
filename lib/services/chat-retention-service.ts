import { createHmac } from "crypto";
import { Storage, type Bucket } from "@google-cloud/storage";

const RETENTION_PREFIX = "chat-retention/v1";
const MAX_MESSAGE_CHARS = 100_000;

export type RetainedTextChatMessage = {
  schemaVersion: 1;
  conversationId: string;
  messageId: string;
  visitorIdHash: string | null;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  retainedAt: string;
  source: "text";
};

export type RetainTextChatMessageInput = {
  conversationId?: string;
  messageId?: string;
  userId?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
};

let bucket: Bucket | null = null;
let warnedDisabled = false;

function retentionEnabled(): boolean {
  return process.env.CHAT_RETENTION_ENABLED === "true";
}

function createStorageClient(): Storage {
  const config: {
    projectId?: string;
    keyFilename?: string;
    credentials?: object;
  } = {
    projectId: process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT,
  };

  if (process.env.GCS_KEY_FILE) {
    config.keyFilename = process.env.GCS_KEY_FILE;
  }

  if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
    config.credentials = JSON.parse(
      Buffer.from(process.env.GCS_SERVICE_ACCOUNT_KEY, "base64").toString()
    );
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !config.keyFilename) {
    try {
      config.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } catch {
      // A file path is handled automatically by Application Default Credentials.
    }
  }

  return new Storage(config);
}

function getRetentionBucket(): Bucket | null {
  if (!retentionEnabled()) {
    return null;
  }

  const bucketName = process.env.CHAT_RETENTION_BUCKET_NAME;
  if (!bucketName) {
    if (!warnedDisabled) {
      console.warn("[ChatRetention] CHAT_RETENTION_BUCKET_NAME is not configured; retention is disabled");
      warnedDisabled = true;
    }
    return null;
  }

  if (!bucket) {
    bucket = createStorageClient().bucket(bucketName);
  }
  return bucket;
}

function safeId(value: string | undefined, fallback: string): string {
  const sanitized = (value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 160);
  return sanitized || fallback;
}

function hashVisitorId(userId: string | undefined): string | null {
  if (!userId) return null;
  const secret = process.env.CHAT_RETENTION_HMAC_SECRET;
  if (!secret) {
    if (!warnedDisabled) {
      console.warn("[ChatRetention] CHAT_RETENTION_HMAC_SECRET is not configured; visitor IDs will not be retained");
      warnedDisabled = true;
    }
    return null;
  }
  return createHmac("sha256", secret).update(userId).digest("hex");
}

function isAlreadyStoredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: number | string };
  return candidate.code === 409 || candidate.code === 412 || candidate.code === "409" || candidate.code === "412";
}

export function retentionObjectName(message: RetainedTextChatMessage): string {
  const conversationId = safeId(message.conversationId, "unknown-conversation");
  const messageId = safeId(message.messageId, "unknown-message");
  return `${RETENTION_PREFIX}/conversations/${conversationId}/messages/${messageId}.json`;
}

/**
 * Store one immutable, user-visible text-chat message.
 * Duplicate writes are ignored, and retention failures never break the chat.
 */
export async function retainTextChatMessage(
  input: RetainTextChatMessageInput
): Promise<boolean> {
  const retentionBucket = getRetentionBucket();
  if (!retentionBucket) return false;

  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!content) return false;
  if (content.length > MAX_MESSAGE_CHARS) {
    console.warn(`[ChatRetention] Refusing oversized ${input.role} message (${content.length} chars)`);
    return false;
  }

  const createdAtMs = Number.isFinite(input.createdAt) ? Number(input.createdAt) : Date.now();
  const message: RetainedTextChatMessage = {
    schemaVersion: 1,
    conversationId: safeId(input.conversationId, "unknown-conversation"),
    messageId: safeId(input.messageId, `${input.role}-${createdAtMs}`),
    visitorIdHash: hashVisitorId(input.userId),
    role: input.role,
    content,
    createdAt: new Date(createdAtMs).toISOString(),
    retainedAt: new Date().toISOString(),
    source: "text",
  };

  try {
    await retentionBucket.file(retentionObjectName(message)).save(
      JSON.stringify(message),
      {
        contentType: "application/json; charset=utf-8",
        resumable: false,
        metadata: {
          cacheControl: "private, no-store",
          metadata: {
            schemaVersion: "1",
            conversationId: message.conversationId,
            role: message.role,
            createdAt: message.createdAt,
          },
        },
        preconditionOpts: { ifGenerationMatch: 0 },
      }
    );
    return true;
  } catch (error) {
    if (isAlreadyStoredError(error)) return true;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ChatRetention] Failed to retain ${input.role} message: ${errorMessage}`);
    return false;
  }
}

export async function listRetainedTextChatMessages(): Promise<RetainedTextChatMessage[]> {
  const retentionBucket = getRetentionBucket();
  if (!retentionBucket) {
    throw new Error("Chat retention is not configured");
  }

  const [files] = await retentionBucket.getFiles({ prefix: `${RETENTION_PREFIX}/conversations/` });
  const messages = await Promise.all(files.map(async (file) => {
    const [buffer] = await file.download();
    return JSON.parse(buffer.toString("utf8")) as RetainedTextChatMessage;
  }));

  return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
