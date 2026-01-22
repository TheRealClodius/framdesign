import { promises as fs } from 'fs';
import path from 'path';
import { TOKEN_CONFIG } from '../constants';

const USAGE_DIR = path.join(process.cwd(), '.usage');
const USAGE_FILE = path.join(USAGE_DIR, 'user-tokens.json');

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
    await this.ensureDir();
    try {
      const data = await fs.readFile(USAGE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  private static async writeUsage(usage: Record<string, UserUsage>) {
    await this.ensureDir();
    await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2), 'utf-8');
  }

  /**
   * Get the current token usage for a user
   */
  static async getUserUsage(userId: string): Promise<UserUsage> {
    const usage = await this.readUsage();
    return usage[userId] || { totalTokens: 0, lastUpdate: new Date().toISOString() };
  }

  /**
   * Record new token usage for a user
   */
  static async recordUsage(userId: string, tokens: number): Promise<UserUsage> {
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
