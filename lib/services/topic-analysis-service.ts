import { Storage } from '@google-cloud/storage';
import { GoogleGenAI } from '@google/genai';
import type { LoggedMessage } from './message-log-service';
import { parseInlineServiceAccount } from '@/lib/utils/gcp-credentials';

export interface TopicAnalysis {
  topTopics: Array<{ topic: string; count: number; examples: string[] }>;
  patterns: string[];
  surprising: string[];
  totalMessages: number;
  analyzedAt: number;
  lastMessageTimestamp: number;
  analysisMode: 'full' | 'incremental';
  incrementCount: number;
}

const GCS_FILE = 'observability/topic-analysis.json';
const MAX_INCREMENTS_BEFORE_FULL = 10;
const AUTO_ANALYZE_THRESHOLD = 20;

// Lazy-init GCS
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

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
  return new GoogleGenAI({ apiKey });
}

function getModel(): string {
  return process.env.GEMINI_OBSERVABILITY_MODEL || 'gemini-2.5-flash';
}

/** Read analysis from GCS, backfilling missing fields for backward compat. */
export async function loadAnalysis(): Promise<TopicAnalysis | null> {
  try {
    const file = getStorage().bucket(bucketName).file(GCS_FILE);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [content] = await file.download();
    const raw = JSON.parse(content.toString());
    return {
      topTopics: raw.topTopics || [],
      patterns: raw.patterns || [],
      surprising: raw.surprising || [],
      totalMessages: raw.totalMessages || 0,
      analyzedAt: raw.analyzedAt || 0,
      lastMessageTimestamp: raw.lastMessageTimestamp ?? raw.analyzedAt ?? 0,
      analysisMode: raw.analysisMode ?? 'full',
      incrementCount: raw.incrementCount ?? 0,
    };
  } catch (err) {
    console.error('[TopicAnalysis] Failed to load from GCS:', err);
    return null;
  }
}

/** Write analysis to GCS. */
export async function saveAnalysis(analysis: TopicAnalysis): Promise<void> {
  try {
    const file = getStorage().bucket(bucketName).file(GCS_FILE);
    await file.save(JSON.stringify(analysis), {
      metadata: { contentType: 'application/json' },
    });
  } catch (err) {
    console.error('[TopicAnalysis] Failed to save to GCS:', err);
  }
}

/** Full analysis: send all messages to Gemini (current behavior). */
export async function analyzeTopicsFull(messages: LoggedMessage[]): Promise<TopicAnalysis> {
  const genAI = getGenAI();
  const messageTexts = messages.map(m => m.message).join('\n- ');

  const result = await genAI.models.generateContent({
    model: getModel(),
    contents: `You are analyzing user messages sent to a design knowledge base AI assistant called FRAM.

Here are the ${messages.length} most recent user messages:
- ${messageTexts}

Analyze these messages and return a JSON object with exactly this structure:
{
  "topTopics": [{"topic": "short topic name", "count": number_of_messages_about_this, "examples": ["example message 1", "example message 2"]}],
  "patterns": ["pattern 1", "pattern 2"],
  "surprising": ["unusual query 1"]
}

Rules:
- topTopics: Top 5-8 topics by frequency. Topic names should be concise (2-4 words).
- patterns: 2-3 notable patterns in how users interact (e.g., "users often ask follow-up questions", "most queries are about specific designers")
- surprising: 0-3 unusual or unexpected queries that stand out

Return ONLY valid JSON, no markdown fences.`,
  });

  const parsed = parseGeminiResponse(result.text);
  const maxTimestamp = messages.reduce((max, m) => Math.max(max, m.timestamp), 0);

  return {
    topTopics: parsed.topTopics || [],
    patterns: parsed.patterns || [],
    surprising: parsed.surprising || [],
    totalMessages: messages.length,
    analyzedAt: Date.now(),
    lastMessageTimestamp: maxTimestamp,
    analysisMode: 'full',
    incrementCount: 0,
  };
}

/** Incremental analysis: send previous summary + new messages to Gemini for merge. */
export async function analyzeTopicsIncremental(
  previous: TopicAnalysis,
  newMessages: LoggedMessage[],
): Promise<TopicAnalysis> {
  const genAI = getGenAI();
  const newTexts = newMessages.map(m => m.message).join('\n- ');

  const previousSummary = JSON.stringify({
    topTopics: previous.topTopics,
    patterns: previous.patterns,
    surprising: previous.surprising,
    totalMessages: previous.totalMessages,
  });

  const result = await genAI.models.generateContent({
    model: getModel(),
    contents: `You are analyzing user messages sent to a design knowledge base AI assistant called FRAM.

PREVIOUS ANALYSIS (based on ${previous.totalMessages} messages):
${previousSummary}

NEW MESSAGES (${newMessages.length} additional messages to incorporate):
- ${newTexts}

Merge the new messages into the previous analysis. Update topic counts, add new topics if they appear frequently enough, and update patterns and surprising queries.

Return a JSON object with exactly this structure:
{
  "topTopics": [{"topic": "short topic name", "count": updated_count, "examples": ["example message 1", "example message 2"]}],
  "patterns": ["pattern 1", "pattern 2"],
  "surprising": ["unusual query 1"]
}

Rules:
- topTopics: Top 5-8 topics by frequency. Increment existing topic counts where new messages match, add new topics if warranted.
- patterns: 2-3 notable patterns (update based on combined data)
- surprising: 0-3 unusual queries (can include new ones, drop old ones that are no longer surprising)

Return ONLY valid JSON, no markdown fences.`,
  });

  const parsed = parseGeminiResponse(result.text);
  const maxTimestamp = newMessages.reduce((max, m) => Math.max(max, m.timestamp), 0);

  return {
    topTopics: parsed.topTopics || [],
    patterns: parsed.patterns || [],
    surprising: parsed.surprising || [],
    totalMessages: previous.totalMessages + newMessages.length,
    analyzedAt: Date.now(),
    lastMessageTimestamp: maxTimestamp,
    analysisMode: 'incremental',
    incrementCount: previous.incrementCount + 1,
  };
}

/** Determine whether auto-analysis should run and in which mode. */
export function shouldAutoAnalyze(
  previous: TopicAnalysis | null,
  newMessageCount: number,
): { shouldAnalyze: boolean; mode: 'full' | 'incremental' } {
  if (!previous) {
    return { shouldAnalyze: newMessageCount > 0, mode: 'full' };
  }
  if (newMessageCount < AUTO_ANALYZE_THRESHOLD) {
    return { shouldAnalyze: false, mode: 'incremental' };
  }
  const needsFull = previous.incrementCount >= MAX_INCREMENTS_BEFORE_FULL;
  return { shouldAnalyze: true, mode: needsFull ? 'full' : 'incremental' };
}

function parseGeminiResponse(text: string | undefined): {
  topTopics?: Array<{ topic: string; count: number; examples: string[] }>;
  patterns?: string[];
  surprising?: string[];
} {
  const raw = text?.trim() || '{}';
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    console.error('[TopicAnalysis] Failed to parse Gemini response');
    return {};
  }
}
