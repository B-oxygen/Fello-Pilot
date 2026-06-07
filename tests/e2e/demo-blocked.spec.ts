import { test, expect } from "@playwright/test";

// Covers PRD AC-3.3 and M2.4: UNSAFE intent flows through the BLOCKED path —
// proposal is still drafted, risk gate fails on multiple dims, no sign button
// is ever shown, and the blocked-variant receipt is recorded.
test("BLOCKED demo: risk gate rejects mainnet intent without exposing sign button", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("seed-prompt-unsafe")).toBeVisible();

  await page.getByTestId("seed-prompt-unsafe").click();

  await expect(page.getByTestId("chat-message-user")).toBeVisible();

  const blockedCard = page
    .locator('[data-testid="chat-card-risk-blocked"]')
    .first();
  await expect(blockedCard).toBeVisible({ timeout: 15_000 });
  await expect(blockedCard).toHaveAttribute("data-verdict", "fail");

  const dimRows = page.locator('[data-testid="risk-dim-row"]');
  await expect.poll(async () => await dimRows.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);

  const signButton = page.locator('[data-testid="sign-button"]');
  await expect(signButton).toHaveCount(0);

  await expect
    .poll(
      async () => {
        const resp = await request.get("/api/memory");
        const body = (await resp.json()) as {
          entries: Array<Record<string, unknown>>;
        };
        return (body.entries ?? []).some((e) => {
          const exec = e.execution as Record<string, unknown> | undefined;
          return exec?.variant === "blocked";
        });
      },
      { timeout: 15_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
});
