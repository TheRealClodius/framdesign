import { NextResponse } from 'next/server';
import { getRecentMessages, getMessagesSince } from '@/lib/services/message-log-service';
import {
  loadAnalysis,
  saveAnalysis,
  analyzeTopicsFull,
  analyzeTopicsIncremental,
} from '@/lib/services/topic-analysis-service';

// GET: Load previous analysis from GCS
export async function GET() {
  try {
    const analysis = await loadAnalysis();
    if (!analysis) {
      return NextResponse.json({ success: true, data: null });
    }
    return NextResponse.json({ success: true, data: analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Topics GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: Run analysis (incremental by default, full if requested or first time)
export async function POST(request: Request) {
  try {
    let forceFull = false;
    try {
      const body = await request.json();
      if (body?.full === true) forceFull = true;
    } catch {
      // No body or invalid JSON — default to incremental
    }

    const previous = await loadAnalysis();

    // First-time or forced full: analyze all recent messages
    if (!previous || forceFull) {
      const messages = await getRecentMessages(24);
      if (messages.length === 0) {
        return NextResponse.json({ success: true, data: null, cached: false });
      }
      const analysis = await analyzeTopicsFull(messages);
      await saveAnalysis(analysis);
      return NextResponse.json({
        success: true,
        data: analysis,
        recentMessages: messages.slice(0, 20),
      });
    }

    // Incremental: only analyze new messages since last watermark
    const newMessages = await getMessagesSince(previous.lastMessageTimestamp);

    if (newMessages.length === 0) {
      return NextResponse.json({ success: true, data: previous, cached: true });
    }

    // Force full re-analysis after too many increments
    const needsFull = previous.incrementCount >= 10;
    let analysis;

    if (needsFull) {
      const allMessages = await getRecentMessages(24);
      analysis = await analyzeTopicsFull(allMessages);
    } else {
      analysis = await analyzeTopicsIncremental(previous, newMessages);
    }

    await saveAnalysis(analysis);
    return NextResponse.json({
      success: true,
      data: analysis,
      recentMessages: newMessages.slice(0, 20),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Topics POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
