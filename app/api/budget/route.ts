import { NextResponse } from "next/server";
import { UsageService } from "@/lib/services/usage-service";

/**
 * GET /api/budget?userId=xxx
 * Check if user has exceeded their budget
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({
        error: "Missing userId parameter"
      }, { status: 400 });
    }

    const isOverBudget = await UsageService.isOverBudget(userId);
    const usage = await UsageService.getUserUsage(userId);
    const remaining = await UsageService.getRemainingTokens(userId);

    return NextResponse.json({
      isOverBudget,
      totalTokens: usage.totalTokens,
      remainingTokens: remaining,
      lastUpdate: usage.lastUpdate
    });
  } catch (error) {
    console.error("Error checking budget:", error);
    return NextResponse.json({
      error: "Failed to check budget"
    }, { status: 500 });
  }
}
