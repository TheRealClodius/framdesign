import { NextResponse } from 'next/server';
import { getRecentMessages, getMessagesSince } from '@/lib/services/message-log-service';
import {
  loadAnalysis,
  saveAnalysis,
  analyzeTopicsFull,
  analyzeTopicsIncremental,
  shouldAutoAnalyze,
} from '@/lib/services/topic-analysis-service';

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const previous = await loadAnalysis();
    const watermark = previous?.lastMessageTimestamp ?? 0;
    const newMessages = await getMessagesSince(watermark);

    const { shouldAnalyze, mode } = shouldAutoAnalyze(previous, newMessages.length);

    if (!shouldAnalyze) {
      return NextResponse.json({
        action: 'skipped',
        reason: `Only ${newMessages.length} new messages (threshold: 20)`,
        lastAnalyzedAt: previous?.analyzedAt ?? null,
      });
    }

    let analysis;
    if (mode === 'full' || !previous) {
      const allMessages = await getRecentMessages(24);
      analysis = await analyzeTopicsFull(allMessages);
    } else {
      analysis = await analyzeTopicsIncremental(previous, newMessages);
    }

    await saveAnalysis(analysis);

    return NextResponse.json({
      action: 'analyzed',
      mode,
      newMessagesProcessed: newMessages.length,
      totalMessages: analysis.totalMessages,
      incrementCount: analysis.incrementCount,
      analyzedAt: analysis.analyzedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Cron] analyze-topics error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
