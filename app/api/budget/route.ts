import { NextResponse } from "next/server";
import { UsageService } from "@/lib/services/usage-service";
import { checkRateLimit } from "@/lib/services/rate-limit-service";
import { resolveBudgetKey } from "@/lib/utils/budget-key";
import { RATE_LIMIT_CONFIG } from "@/lib/constants";

/**
 * GET /api/budget?userId=xxx
 * Check if user has exceeded their budget.
 * `userId` must match the browser-generated pattern (see getUserId); otherwise the budget key falls back to IP hash.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const budgetKey = resolveBudgetKey(userId ?? undefined, request);

    const limit = checkRateLimit(
      "budget_api",
      budgetKey,
      RATE_LIMIT_CONFIG.BUDGET_API_WINDOW_MS,
      RATE_LIMIT_CONFIG.BUDGET_API_MAX_PER_WINDOW
    );
    if (!limit.ok) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: "Too many budget checks. Please wait.",
          retryAfterSec: limit.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSec) },
        }
      );
    }

    const isOverBudget = await UsageService.isOverBudget(budgetKey);
    const usage = await UsageService.getUserUsage(budgetKey);
    const remaining = await UsageService.getRemainingTokens(budgetKey);

    return NextResponse.json({
      isOverBudget,
      totalTokens: usage.totalTokens,
      remainingTokens: remaining,
      lastUpdate: usage.lastUpdate,
    });
  } catch (error) {
    console.error("Error checking budget:", error);
    return NextResponse.json(
      {
        error: "Failed to check budget",
      },
      { status: 500 }
    );
  }
}
