import { promises as fs } from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { TOKEN_CONFIG } from '../constants';

/** Override for tests / multi-worker isolation (`FRAM_USAGE_DIR`). */
const USAGE_DIR = process.env.FRAM_USAGE_DIR
  ? path.resolve(process.env.FRAM_USAGE_DIR)
  : path.join(process.cwd(), '.usage');
const USAGE_FILE = path.join(USAGE_DIR, 'user-tokens.json');
const USAGE_GCS_OBJECT = 'internal/usage/user-tokens.json';

export interface UserUsage {
  totalTokens: number;
  lastUpdate: string;
}

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
      // File path — SDK uses ADC
    }
  }

  storage = new Storage(config);
  bucketName = process.env.GCS_BUCKET_NAME || 'framdesign-assets';
  return storage;
}

async function readFromGCS(): Promise<Record<string, UserUsage>> {
  try {
    const file = getStorage().bucket(bucketName).file(USAGE_GCS_OBJECT);
    const [exists] = await file.exists();
    if (!exists) return {};
    const [content] = await file.download();
    return JSON.parse(content.toString()) as Record<string, UserUsage>;
  } catch (err) {
    console.error('[UsageService] GCS read failed:', err);
    return {};
  }
}

async function writeToGCS(usage: Record<string, UserUsage>): Promise<void> {
  const file = getStorage().bucket(bucketName).file(USAGE_GCS_OBJECT);
  await file.save(JSON.stringify(usage, null, 2), {
    metadata: { contentType: 'application/json' },
  });
}

/**
 * Use GCS for usage when explicitly requested or when bucket + JSON credentials are present.
 * Avoids treating "project id only" .env as GCS-ready (would break reads/writes).
 */
function useGcsForUsage(): boolean {
  if (process.env.USAGE_STORAGE === 'file') return false;
  if (process.env.USAGE_STORAGE === 'gcs') return true;
  const creds =
    Boolean(process.env.GCS_SERVICE_ACCOUNT_KEY) ||
    (typeof process.env.GOOGLE_APPLICATION_CREDENTIALS === 'string' &&
      process.env.GOOGLE_APPLICATION_CREDENTIALS.trim().startsWith('{'));
  return Boolean(process.env.GCS_BUCKET_NAME && creds);
}

export class UsageService {
  private static async ensureDir() {
    try {
      await fs.access(USAGE_DIR);
    } catch {
      try {
        await fs.mkdir(USAGE_DIR, { recursive: true });
      } catch {
        // Read-only filesystem (e.g., Vercel) — skip silently.
      }
    }
  }

  private static async readUsageFile(): Promise<Record<string, UserUsage>> {
    await this.ensureDir();
    try {
      const data = await fs.readFile(USAGE_FILE, 'utf-8');
      return JSON.parse(data) as Record<string, UserUsage>;
    } catch {
      return {};
    }
  }

  private static async writeUsageFile(usage: Record<string, UserUsage>): Promise<void> {
    try {
      await this.ensureDir();
      await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2), 'utf-8');
    } catch {
      // Read-only filesystem
    }
  }

  private static async readUsageMerged(): Promise<Record<string, UserUsage>> {
    if (useGcsForUsage()) {
      return readFromGCS();
    }
    return this.readUsageFile();
  }

  private static async persistUsage(usage: Record<string, UserUsage>): Promise<void> {
    if (useGcsForUsage()) {
      try {
        await writeToGCS(usage);
        return;
      } catch (err) {
        console.error('[UsageService] GCS write failed, falling back to file:', err);
      }
    }
    await this.writeUsageFile(usage);
  }

  /**
   * Get the current token usage for a user (budget key).
   */
  static async getUserUsage(userId: string): Promise<UserUsage> {
    const usage = await this.readUsageMerged();
    return usage[userId] || { totalTokens: 0, lastUpdate: new Date().toISOString() };
  }

  /**
   * Record new token usage for a budget key.
   */
  static async recordUsage(userId: string, tokens: number): Promise<UserUsage> {
    const usage = await this.readUsageMerged();
    const current = usage[userId] || { totalTokens: 0, lastUpdate: new Date().toISOString() };

    const updated: UserUsage = {
      totalTokens: current.totalTokens + tokens,
      lastUpdate: new Date().toISOString(),
    };

    usage[userId] = updated;
    await this.persistUsage(usage);
    return updated;
  }

  /**
   * Check if budget key has exceeded the global token budget.
   */
  static async isOverBudget(userId: string): Promise<boolean> {
    const usage = await this.getUserUsage(userId);
    return usage.totalTokens >= TOKEN_CONFIG.MAX_GLOBAL_TOKENS_PER_USER;
  }

  /**
   * Remaining tokens before the global cap.
   */
  static async getRemainingTokens(userId: string): Promise<number> {
    const usage = await this.getUserUsage(userId);
    return Math.max(0, TOKEN_CONFIG.MAX_GLOBAL_TOKENS_PER_USER - usage.totalTokens);
  }
}
