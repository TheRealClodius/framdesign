import { getRedis } from './redis-service';

const CONV_TTL = 60 * 60 * 24 * 90; // 90 days

interface ConversationTurn {
  userMessage: string;
  toolsCalled: string[];
  timestamp: number;
}

interface ConversationMeta {
  userId: string;
  startTime: number;
  lastActivity: number;
  turnCount: number;
  firstMessage: string;
}

interface ConversationContextData {
  summaryPresent: boolean;
  cachedContentUsed: boolean;
  toolMemoryState: string;
  estimatedTokens: number;
}

export async function logConversationTurn(
  convId: string,
  userId: string,
  userMessage: string,
  toolsCalled: string[],
  contextStack?: ConversationContextData
): Promise<void> {
  try {
    const redis = getRedis();
    const now = Date.now();
    const truncatedMessage = userMessage.slice(0, 200);

    // Upsert conversation metadata
    const convKey = `obs:conv:${convId}`;
    const exists = await redis.exists(convKey);

    if (!exists) {
      await redis.hset(convKey, {
        userId,
        startTime: now,
        lastActivity: now,
        turnCount: 1,
        firstMessage: truncatedMessage,
      });
      await redis.zadd('obs:convs', { score: now, member: convId });
    } else {
      await redis.hset(convKey, { lastActivity: now });
      await redis.hincrby(convKey, 'turnCount', 1);
      await redis.zadd('obs:convs', { score: now, member: convId });
    }

    // Append message to conversation messages list
    const turn: ConversationTurn = {
      userMessage: truncatedMessage,
      toolsCalled,
      timestamp: now,
    };
    await redis.rpush(`obs:conv:${convId}:messages`, JSON.stringify(turn));

    // Store context stack if provided
    if (contextStack) {
      await redis.hset(`obs:conv:${convId}:context`, {
        summaryPresent: contextStack.summaryPresent ? '1' : '0',
        cachedContentUsed: contextStack.cachedContentUsed ? '1' : '0',
        toolMemoryState: contextStack.toolMemoryState,
        estimatedTokens: contextStack.estimatedTokens,
      });
    }

    // Set TTL on all conv keys
    await redis.expire(convKey, CONV_TTL);
    await redis.expire(`obs:conv:${convId}:messages`, CONV_TTL);
    if (contextStack) {
      await redis.expire(`obs:conv:${convId}:context`, CONV_TTL);
    }
  } catch (error) {
    // Fire-and-forget: log but don't throw
    console.error('[observability] Failed to log conversation turn:', error);
  }
}

export async function logVoiceUsage(userId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.incr('obs:voice:sessions');
    await redis.sadd('obs:voice:users', userId);
  } catch (error) {
    console.error('[observability] Failed to log voice usage:', error);
  }
}

export async function getConversations(
  limit: number = 50,
  offset: number = 0
): Promise<{ conversations: (ConversationMeta & { id: string })[]; total: number }> {
  const redis = getRedis();
  const total = await redis.zcard('obs:convs');
  const ids = await redis.zrange('obs:convs', offset, offset + limit - 1, { rev: true });

  const conversations = await Promise.all(
    (ids as string[]).map(async (id) => {
      const meta = await redis.hgetall(`obs:conv:${id}`);
      return {
        id,
        userId: (meta?.userId as string) || '',
        startTime: Number(meta?.startTime) || 0,
        lastActivity: Number(meta?.lastActivity) || 0,
        turnCount: Number(meta?.turnCount) || 0,
        firstMessage: (meta?.firstMessage as string) || '',
      };
    })
  );

  return { conversations, total };
}

export async function getConversationDetail(convId: string): Promise<{
  meta: ConversationMeta;
  messages: ConversationTurn[];
  context: ConversationContextData | null;
}> {
  const redis = getRedis();

  const meta = await redis.hgetall(`obs:conv:${convId}`);
  const rawMessages = await redis.lrange(`obs:conv:${convId}:messages`, 0, -1);
  const rawContext = await redis.hgetall(`obs:conv:${convId}:context`);

  const messages = rawMessages.map((m) => {
    if (typeof m === 'string') return JSON.parse(m) as ConversationTurn;
    return m as unknown as ConversationTurn;
  });

  const context = rawContext && Object.keys(rawContext).length > 0
    ? {
        summaryPresent: rawContext.summaryPresent === '1',
        cachedContentUsed: rawContext.cachedContentUsed === '1',
        toolMemoryState: (rawContext.toolMemoryState as string) || '',
        estimatedTokens: Number(rawContext.estimatedTokens) || 0,
      }
    : null;

  return {
    meta: {
      userId: (meta?.userId as string) || '',
      startTime: Number(meta?.startTime) || 0,
      lastActivity: Number(meta?.lastActivity) || 0,
      turnCount: Number(meta?.turnCount) || 0,
      firstMessage: (meta?.firstMessage as string) || '',
    },
    messages,
    context,
  };
}

export async function getVoiceStats(): Promise<{ totalSessions: number; uniqueUsers: number }> {
  const redis = getRedis();
  const totalSessions = (await redis.get<number>('obs:voice:sessions')) || 0;
  const uniqueUsers = await redis.scard('obs:voice:users');
  return { totalSessions, uniqueUsers };
}

export async function getAggregateStats(): Promise<{
  totalConversations: number;
  avgTurnCount: number;
  voiceSessions: number;
}> {
  const redis = getRedis();
  const totalConversations = await redis.zcard('obs:convs');

  // Sample recent conversations for avg turn count
  const recentIds = await redis.zrange('obs:convs', 0, 99, { rev: true });
  let totalTurns = 0;
  for (const id of recentIds as string[]) {
    const tc = await redis.hget(`obs:conv:${id}`, 'turnCount');
    totalTurns += Number(tc) || 0;
  }
  const avgTurnCount = recentIds.length > 0 ? totalTurns / recentIds.length : 0;

  const voiceSessions = (await redis.get<number>('obs:voice:sessions')) || 0;

  return { totalConversations, avgTurnCount: Math.round(avgTurnCount * 10) / 10, voiceSessions };
}
