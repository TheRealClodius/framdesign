import { NextResponse } from 'next/server';
import { getAnalyticsData } from '@/lib/services/analytics-service';

export async function GET() {
  try {
    const data = await getAnalyticsData();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Analytics API error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
