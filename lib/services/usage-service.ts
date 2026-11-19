import { promises as fs } from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { TOKEN_CONFIG } from '../constants';
import { parseInlineServiceAccount } from '@/lib/utils/gcp-credentials';

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
    // Inline JSON (Vercel / .env.local); null means a file path the SDK reads via ADC
    const credentials = parseInlineServiceAccount(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (credentials) config.credentials = credentials;
  }

  storage = new Storage(config);
  bucketName = process.env.GCS_BUCKET_NAME || 'framdesign-assets';
  return storage;
}

type UsageMap = Record<string, UserUsage>;

/** A snapshot of the GCS ledger plus the object generation it was read at (0 = object absent). */
interface GcsSnapshot {
  usage: UsageMap;
  generation: number;
}

function gcsErrorCode(err: unknown): number | undefined {
  const code = (err as { code?: unknown })?.code;
  return typeof code === 'number' ? code : undefined;
}

/**
 * Read the ledger. Throws on any failure other than "object does not exist" so a
 * transient error can never be mistaken for an empty ledger and written back.
 */
async function readFromGCS(): Promise<GcsSnapshot> {
  const bucket = getStorage().bucket(bucketName);
  let generation: number;
  try {
    const [metadata] = await bucket.file(USAGE_GCS_OBJECT).getMetadata();
    generation = Number(metadata.generation);
  } catch (err) {
    if (gcsErrorCode(err) === 404) return { usage: {}, generation: 0 };
    throw err;
  }
  // Pin the download to the generation we saw so usage and generation stay consistent
  const [content] = await bucket.file(USAGE_GCS_OBJECT, { generation }).download();
  return { usage: JSON.parse(content.toString()) as UsageMap, generation };
}

/** Write only if the object is still at `generation` (0 = must not exist yet). */
async function writeToGCS(usage: UsageMap, generation: number): Promise<void> {
  const file = getStorage().bucket(bucketName).file(USAGE_GCS_OBJECT);
  await file.save(JSON.stringify(usage, null, 2), {
    metadata: { contentType: 'application/json' },
    preconditionOpts: { ifGenerationMatch: generation },
  });
}

const GCS_WRITE_ATTEMPTS = 3;

/**
 * Use GCS for usage when explicitly requested or when bucket + JSON credentials are present.
 * Avoids treating "project id only" .env as GCS-ready (would break reads/writes).
 */
function shouldUseGcsForUsage(): boolean {
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

  private static async readUsageFile(): Promise<UsageMap> {
    await this.ensureDir();
    try {
      const data = await fs.readFile(USAGE_FILE, 'utf-8');
      return JSON.parse(data) as UsageMap;
    } catch {
      return {};
    }
  }

  private static async writeUsageFile(usage: UsageMap): Promise<void> {
    try {
      await this.ensureDir();
      await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2), 'utf-8');
    } catch {
      // Read-only filesystem
    }
  }

  private static async readUsage(): Promise<UsageMap> {
    if (shouldUseGcsForUsage()) {
      try {
        return (await readFromGCS()).usage;
      } catch (err) {
        // Fail open for reads: a storage blip should not lock visitors out
        console.error('[UsageService] GCS read failed:', err);
        return {};
      }
    }
    return this.readUsageFile();
  }

  /**
   * Get the current token usage for a user (budget key).
   */
  static async getUserUsage(userId: string): Promise<UserUsage> {
    const usage = await this.readUsage();
    return usage[userId] || { totalTokens: 0, lastUpdate: new Date().toISOString() };
  }

  /**
   * Record new token usage for a budget key.
   */
  static async recordUsage(userId: string, tokens: number): Promise<UserUsage> {
    const apply = (usage: UsageMap): UserUsage => {
      const current = usage[userId] || { totalTokens: 0, lastUpdate: new Date().toISOString() };
      const updated: UserUsage = {
        totalTokens: current.totalTokens + tokens,
        lastUpdate: new Date().toISOString(),
      };
      usage[userId] = updated;
      return updated;
    };

    if (!shouldUseGcsForUsage()) {
      const usage = await this.readUsageFile();
      const updated = apply(usage);
      await this.writeUsageFile(usage);
      return updated;
    }

    // Read-modify-write guarded by the object generation; retry when another
    // instance wrote in between. Never write after a failed read.
    let lastError: unknown;
    for (let attempt = 1; attempt <= GCS_WRITE_ATTEMPTS; attempt++) {
      let snapshot: GcsSnapshot;
      try {
        snapshot = await readFromGCS();
      } catch (err) {
        console.error('[UsageService] GCS read failed; usage not recorded:', err);
        return { totalTokens: tokens, lastUpdate: new Date().toISOString() };
      }

      const updated = apply(snapshot.usage);
      try {
        await writeToGCS(snapshot.usage, snapshot.generation);
        return updated;
      } catch (err) {
        lastError = err;
        if (gcsErrorCode(err) !== 412) break; // not a concurrent-write conflict
      }
    }

    console.error('[UsageService] GCS write failed; usage not recorded:', lastError);
    return { totalTokens: tokens, lastUpdate: new Date().toISOString() };
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
