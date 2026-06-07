import { test, expect } from "@playwright/test";

// Covers PRD AC-1.1, AC-2.1, AC-3.1, AC-3.4 (9 risk-dim-rows), AC-4.1
// deterministically through the UI without a real wallet. Stages 5-7
// (sign / execute / memory) require a real EIP-712 signature, which
// scripts/demo_safe_e2e.mjs covers headlessly via viem; together the two
// tests cover the M1.6 7-stage requirement end-to-end. The split is
// honest: Playwright tests UI rendering and deterministic state
// transitions; the .mjs e2e tests signature verification and adapter
// execution paths under the SAME server.
test("SAFE demo: UI stages 1-4 reach the wallet-connect prompt with all testids", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("seed-prompt-safe")).toBeVisible();
  await page.getByTestId("seed-prompt-safe").click();

  // Stage 1 — user message echoed (AC-1.1).
  await expect(page.getByTestId("chat-message-user").first()).toBeVisible();

  // Stage 2 — proposal card with data-action / data-chain / data-amount (AC-2.1).
  const proposalCard = page.locator('[data-testid="chat-card-proposal"]').first();
  await expect(proposalCard).toBeVisible({ timeout: 20_000 });
  await expect(proposalCard).toHaveAttribute("data-action", "swap");
  await expect(proposalCard).toHaveAttribute("data-chain", "sepolia");
  await expect(proposalCard).toHaveAttribute("data-amount", "1");

  // Stage 3 — risk-report card with all 9 risk-dim-rows (AC-3.1, AC-3.4).
  const riskCard = page
    .locator('[data-testid="chat-card-risk-report"]')
    .first();
  await expect(riskCard).toBeVisible({ timeout: 15_000 });
  await expect(riskCard).toHaveAttribute("data-verdict", "pass");
  const dimRows = page.locator('[data-testid="risk-dim-row"]');
  await expect.poll(async () => await dimRows.count(), { timeout: 15_000 }).toBe(9);

  // Stage 4 — wallet-connect prompt with the connect button (AC-4.1).
  // The sign-button MUST NOT appear before connection (AC-5.4 invariant).
  await expect(
    page.getByTestId("chat-message-wallet-connect-prompt").first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("wallet-connect-button").first()).toBeVisible();
  await expect(page.locator('[data-testid="sign-button"]')).toHaveCount(0);
});
