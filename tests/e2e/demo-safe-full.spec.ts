import { test, expect } from "@playwright/test";
import { installWalletMock } from "./helpers/wallet-mock";

// Full SAFE 7-stage e2e via the wallet-mock + sign-server toolset. Picks up
// where demo-safe.spec.ts (stages 1-4) leaves off, and covers:
//   - AC-4.3 connected-pill format (short address + " · Sepolia")
//   - AC-5.4 chat-card-delegation-signed after typed-data signature verified
//   - AC-6.1 chat-card-receipt with SIMULATION badge (mock adapter default)
// The mock provider is EIP-6963-announced before page.goto, so wagmi's
// injected() connector discovers it. Signing relays through sign-server
// (port 3098) which is auto-spawned by global-setup.ts when globalSetup is
// enabled in playwright.config.ts.
test("SAFE demo: all 7 stages via wallet-mock reach chat-card-receipt + AC-4.3 pill", async ({
  page,
}) => {
  // Capture browser console + page errors for diagnostics. Stage 5 used to
  // fail silently in earlier runs because all sign errors collapse to the
  // generic chat-message-signature-refused; this log surfaces the actual
  // exception path.
  page.on("console", (msg) => {
    console.log(`[browser:${msg.type()}]`, msg.text());
  });
  page.on("pageerror", (err) => {
    console.log("[browser:pageerror]", err.message);
  });

  const mockAddress = await installWalletMock(page);
  console.log(`[test] wallet-mock address: ${mockAddress}`);

  await page.goto("/");
  await expect(page.getByTestId("seed-prompt-safe")).toBeVisible();
  await page.getByTestId("seed-prompt-safe").click();

  // Stages 1-3 (covered with stricter assertions in demo-safe.spec.ts)
  await expect(page.getByTestId("chat-message-user").first()).toBeVisible();
  await expect(
    page.locator('[data-testid="chat-card-proposal"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator('[data-testid="chat-card-risk-report"]').first(),
  ).toBeVisible({ timeout: 15_000 });

  // Stage 4: connect prompt → click → wallet-connected message + auto-resume.
  await expect(
    page.getByTestId("chat-message-wallet-connect-prompt").first(),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("wallet-connect-button").first().click();

  await expect(
    page.getByTestId("chat-message-wallet-connected").first(),
  ).toBeVisible({ timeout: 15_000 });

  // AC-4.3: connected-pill shows the 0xAAAA…BBBB short form + Sepolia label,
  // and the full mock address MUST NOT appear in the pill text.
  const pill = page.getByTestId("wallet-connected-pill").first();
  await expect(pill).toBeVisible({ timeout: 10_000 });
  const pillText = (await pill.textContent()) ?? "";
  expect(pillText).toMatch(/^0x[a-f0-9]{4}…[a-f0-9]{4} · Sepolia$/i);
  expect(pillText.toLowerCase()).not.toContain(mockAddress.toLowerCase());

  // Stage 5: delegation-signed card appears once verify route returns
  // {valid:true}. The wallet-mock relays eth_signTypedData_v4 → sign-server
  // → viem.privateKeyToAccount.signTypedData. If anything fails here we
  // would see chat-message-signature-refused or
  // chat-message-personal-sign-fallback-notice instead.
  await expect(
    page.locator('[data-testid="chat-card-delegation-signed"]').first(),
  ).toBeVisible({ timeout: 30_000 });

  // Stage 6: execution receipt with SIMULATION badge (mock adapter default;
  // no FELLOPILOT_ADAPTER env override in this test).
  const receipt = page.locator('[data-testid="chat-card-receipt"]').first();
  await expect(receipt).toBeVisible({ timeout: 30_000 });
  await expect(receipt).toHaveAttribute("data-simulated", "true");
  await expect(page.getByTestId("simulation-badge").first()).toBeVisible();

  // Stage 7 (memory) is enforced by scripts/demo_safe_e2e.mjs server-side
  // and tests/e2e/memory-durability.spec.ts. We skip the on-page memory
  // panel check here to avoid coupling this spec to right-column layout.
});
