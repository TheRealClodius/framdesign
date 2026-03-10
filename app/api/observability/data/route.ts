import { NextRequest, NextResponse } from 'next/server';
import {
  getConversations,
  getConversationDetail,
  getVoiceStats,
  getAggregateStats,
} from '@/lib/services/observability-service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    switch (type) {
      case 'conversations': {
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);
        const data = await getConversations(limit, offset);
        return NextResponse.json({ success: true, data });
      }

      case 'conversation': {
        const id = searchParams.get('id');
        if (!id) {
          return NextResponse.json({ error: 'Missing conversation id' }, { status: 400 });
        }
        const data = await getConversationDetail(id);
        return NextResponse.json({ success: true, data });
      }

      case 'voice': {
        const data = await getVoiceStats();
        return NextResponse.json({ success: true, data });
      }

      case 'stats': {
        const data = await getAggregateStats();
        return NextResponse.json({ success: true, data });
      }

      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Observability data API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch observability data' },
      { status: 500 }
    );
  }
}
