import { promises as fs } from 'fs';
import path from 'path';
import { Redis } from '@upstash/redis';
import { TOKEN_CONFIG } from '../constants';

const USAGE_DIR = path.join(process.cwd(), '.usage');
const USAGE_FILE = path.join(USAGE_DIR, 'user-tokens.json');
const KV_TOTAL_KEY = (userId: string) => `usage:${userId}:totalTokens`;
const KV_LAST_KEY = (userId: string) => `usage:${userId}:lastUpdate`;
let redisClient: Redis | null = null;

function isKvEnabled(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
    });
  }
  return redisClient;
}

export interface UserUsage {
  totalTokens: number;
  lastUpdate: string;
}

export class UsageService {
  private static async ensureDir() {
    try {
      await fs.access(USAGE_DIR);
    } catch {
      await fs.mkdir(USAGE_DIR, { recursive: true });
    }
  }

  private static async readUsage(): Promise<Record<string, UserUsage>> {
    if (isKvEnabled()) {
      return {};
    }
    await this.ensureDir();
    try {
      const data = await fs.readFile(USAGE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  private static async writeUsage(usage: Record<string, UserUsage>) {
    if (isKvEnabled()) {
      return;
    }
    await this.ensureDir();
    await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2), 'utf-8');
  }

  /**
   * Get the current token usage for a user
   */
  static async getUserUsage(userId: string): Promise<UserUsage> {
    if (isKvEnabled()) {
      const redis = getRedis();
      const [totalTokens, lastUpdate] = await Promise.all([
        redis.get<number>(KV_TOTAL_KEY(userId)),
        redis.get<string>(KV_LAST_KEY(userId)),
      ]);

      return {
        totalTokens: totalTokens ?? 0,
        lastUpdate: lastUpdate ?? new Date().toISOString(),
      };
    }

    const usage = await this.readUsage();
    return usage[userId] || { totalTokens: 0, lastUpdate: new Date().toISOString() };
  }

  /**
   * Record new token usage for a user
   */
  static async recordUsage(userId: string, tokens: number): Promise<UserUsage> {
    if (isKvEnabled()) {
      const redis = getRedis();
      const totalTokens = await redis.incrby(KV_TOTAL_KEY(userId), tokens);
      const lastUpdate = new Date().toISOString();
      await redis.set(KV_LAST_KEY(userId), lastUpdate);
      return { totalTokens, lastUpdate };
    }

    const usage = await this.readUsage();
    const current = usage[userId] || { totalTokens: 0, lastUpdate: new Date().toISOString() };

    const updated: UserUsage = {
      totalTokens: current.totalTokens + tokens,
      lastUpdate: new Date().toISOString()
    };

    usage[userId] = updated;
    await this.writeUsage(usage);
    return updated;
  }

  /**
   * Check if a user has exceeded their global budget
   */
  static async isOverBudget(userId: string): Promise<boolean> {
    const usage = await this.getUserUsage(userId);
    return usage.totalTokens >= TOKEN_CONFIG.MAX_GLOBAL_TOKENS_PER_USER;
  }

  /**
   * Get remaining tokens for a user
   */
  static async getRemainingTokens(userId: string): Promise<number> {
    const usage = await this.getUserUsage(userId);
    return Math.max(0, TOKEN_CONFIG.MAX_GLOBAL_TOKENS_PER_USER - usage.totalTokens);
  }
}
