import { test, expect } from "@playwright/test";

/**
 * E2E tests verifying model-driven tool chaining (no server-side AutoChain).
 *
 * Requires: PORT=3001 npm run dev (running against the local dev server)
 */

/** Helper: send a message in the chat and wait for the assistant reply */
async function sendMessage(page: import("@playwright/test").Page, text: string) {
  const input = page.getByTestId("chat-input");
  await input.fill(text);
  await input.press("Enter");

  // Wait for at least one assistant message to appear after sending
  const assistantMessages = page.getByTestId("message-assistant");
  const countBefore = await assistantMessages.count();
  await expect(async () => {
    expect(await assistantMessages.count()).toBeGreaterThan(countBefore);
  }).toPass({ timeout: 30_000 });
}

/** Helper: get text content of the last assistant message */
async function lastAssistantText(page: import("@playwright/test").Page): Promise<string> {
  const msgs = page.getByTestId("message-assistant");
  const count = await msgs.count();
  return (await msgs.nth(count - 1).textContent()) ?? "";
}

test.describe("Model-driven tool chaining (no AutoChain)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for chat input to be ready
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 15_000 });
  });

  test("project query returns relevant content", async ({ page }) => {
    await sendMessage(page, "Tell me about the Volvo project");
    const text = await lastAssistantText(page);
    // The response should mention the project by name
    expect(text.toLowerCase()).toContain("volvo");
  });

  test("follow-up does not repeat the same image", async ({ page }) => {
    await sendMessage(page, "Show me the Volvo project");
    const firstReply = await lastAssistantText(page);

    await sendMessage(page, "Show me another image from this project");
    const secondReply = await lastAssistantText(page);

    // Extract image URLs/paths from both replies
    const imgPattern = /!\[.*?\]\((.*?)\)/g;
    const firstImages = [...firstReply.matchAll(imgPattern)].map((m) => m[1]);
    const secondImages = [...secondReply.matchAll(imgPattern)].map((m) => m[1]);

    // If both replies contain images, they should not be identical sets
    if (firstImages.length > 0 && secondImages.length > 0) {
      const firstSet = new Set(firstImages);
      const allSame = secondImages.every((img) => firstSet.has(img));
      // Allow if truly no other images exist, but flag if identical
      if (secondImages.length > 0) {
        expect(allSame).toBe(false);
      }
    }
  });

  test("factual question does not force irrelevant image", async ({ page }) => {
    await sendMessage(page, "What design principles does FRAM follow?");
    const text = await lastAssistantText(page);

    // The response should contain substantive text
    expect(text.length).toBeGreaterThan(50);

    // Count image references — a purely factual answer shouldn't have many
    const imgCount = (text.match(/!\[.*?\]\(.*?\)/g) || []).length;
    expect(imgCount).toBeLessThanOrEqual(1);
  });
});
