import { NextResponse } from 'next/server';
import { getAnalyticsData } from '@/lib/services/analytics-service';

export async function GET() {
  try {
    const data = await getAnalyticsData();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
