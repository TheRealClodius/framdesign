import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { fetchRecentUserMessages, type ParsedLogEntry } from '@/lib/services/vercel-logs-service';

interface TopicAnalysis {
  topTopics: Array<{ topic: string; count: number; examples: string[] }>;
  patterns: string[];
  surprising: string[];
  totalMessages: number;
  analyzedAt: number;
}

let cachedResult: { data: TopicAnalysis; expiresAt: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function analyzeTopics(messages: ParsedLogEntry[]): Promise<TopicAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  const genAI = new GoogleGenAI({ apiKey });
  const messageTexts = messages.map(m => m.message).join('\n- ');

  const result = await genAI.models.generateContent({
    model: process.env.GEMINI_OBSERVABILITY_MODEL || 'gemini-2.5-flash',
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

  const text = result.text?.trim() || '{}';
  const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '');

  try {
    const parsed = JSON.parse(cleaned);
    return {
      topTopics: parsed.topTopics || [],
      patterns: parsed.patterns || [],
      surprising: parsed.surprising || [],
      totalMessages: messages.length,
      analyzedAt: Date.now(),
    };
  } catch {
    return {
      topTopics: [],
      patterns: ['Analysis parsing failed — raw response available in logs'],
      surprising: [],
      totalMessages: messages.length,
      analyzedAt: Date.now(),
    };
  }
}

export async function GET() {
  try {
    // Return cached result if fresh
    if (cachedResult && Date.now() < cachedResult.expiresAt) {
      return NextResponse.json({ success: true, data: cachedResult.data, cached: true });
    }

    const messages = await fetchRecentUserMessages(24);

    if (messages.length === 0) {
      const empty: TopicAnalysis = {
        topTopics: [],
        patterns: [],
        surprising: [],
        totalMessages: 0,
        analyzedAt: Date.now(),
      };
      return NextResponse.json({ success: true, data: empty, cached: false });
    }

    const analysis = await analyzeTopics(messages);

    // Cache the result
    cachedResult = { data: analysis, expiresAt: Date.now() + CACHE_TTL };

    return NextResponse.json({
      success: true,
      data: analysis,
      recentMessages: messages.slice(0, 20),
      cached: false,
    });
  } catch (error) {
    console.error('Topics API error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze topics' },
      { status: 500 }
    );
  }
}
