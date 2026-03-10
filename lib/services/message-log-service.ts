import { Storage } from '@google-cloud/storage';

export interface LoggedMessage {
  userId: string;
  message: string;
  toolsCalled: string[];
  timestamp: number;
}

const GCS_FILE = 'observability/message-log.json';
const MAX_ENTRIES = 500;

// Lazy-init GCS client (reuses same credential logic as blob-storage-service)
let storage: Storage | null = null;
let bucketName: string;

function getStorage(): Storage {
  if (storage) return storage;

  const config: { projectId?: string; credentials?: object } = {
    projectId: process.env.GCS_PROJECT_ID || process.env.VERTEXAI_PROJECT,
  };

  if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
    config.credentials = JSON.parse(
      Buffer.from(process.env.GCS_SERVICE_ACCOUNT_KEY, 'base64').toString()
    );
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      config.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } catch {
      // File path — SDK handles it via ADC
    }
  }

  storage = new Storage(config);
  bucketName = process.env.GCS_BUCKET_NAME || 'framdesign-assets';
  return storage;
}

// In-memory write buffer — flushed to GCS asynchronously
const writeBuffer: LoggedMessage[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY_MS = 5_000; // batch writes over 5 seconds

async function readFromGCS(): Promise<LoggedMessage[]> {
  try {
    const file = getStorage().bucket(bucketName).file(GCS_FILE);
    const [exists] = await file.exists();
    if (!exists) return [];
    const [content] = await file.download();
    return JSON.parse(content.toString());
  } catch (err) {
    console.error('[MessageLog] Failed to read from GCS:', err);
    return [];
  }
}

async function writeToGCS(messages: LoggedMessage[]): Promise<void> {
  try {
    const file = getStorage().bucket(bucketName).file(GCS_FILE);
    await file.save(JSON.stringify(messages), {
      metadata: { contentType: 'application/json' },
    });
  } catch (err) {
    console.error('[MessageLog] Failed to write to GCS:', err);
  }
}

async function flushBuffer(): Promise<void> {
  if (writeBuffer.length === 0) return;

  const toFlush = writeBuffer.splice(0);
  const existing = await readFromGCS();
  const merged = [...existing, ...toFlush];

  // Trim to ring buffer size
  const trimmed = merged.length > MAX_ENTRIES
    ? merged.slice(merged.length - MAX_ENTRIES)
    : merged;

  await writeToGCS(trimmed);
}

export function logMessage(userId: string, message: string, toolsCalled: string[]): void {
  writeBuffer.push({
    userId,
    message: message.slice(0, 200),
    toolsCalled,
    timestamp: Date.now(),
  });

  // Debounce flush to batch concurrent writes
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushBuffer().catch(err => console.error('[MessageLog] Flush error:', err));
  }, FLUSH_DELAY_MS);
}

// Read-through cache for getRecentMessages (avoids hitting GCS on every dashboard load)
let readCache: { data: LoggedMessage[]; expiresAt: number } | null = null;
const READ_CACHE_TTL = 60_000; // 1 minute

export async function getRecentMessages(hours = 24): Promise<LoggedMessage[]> {
  // Include unflushed buffer messages
  let all: LoggedMessage[];

  if (readCache && Date.now() < readCache.expiresAt) {
    all = [...readCache.data, ...writeBuffer];
  } else {
    const gcsData = await readFromGCS();
    readCache = { data: gcsData, expiresAt: Date.now() + READ_CACHE_TTL };
    all = [...gcsData, ...writeBuffer];
  }

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return all
    .filter(m => m.timestamp > cutoff)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function getMessageCount(): Promise<number> {
  const data = await readFromGCS();
  return data.length + writeBuffer.length;
}
