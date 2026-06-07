import { test, expect } from "@playwright/test";
import { installWalletMock } from "./helpers/wallet-mock";

test("AC-5.2 personal_sign fallback: wallet refuses signTypedData_v4, personal_sign succeeds", async ({
  page,
}) => {
  page.on("console", (msg) => {
    console.log(`[browser:${msg.type()}]`, msg.text());
  });
  page.on("pageerror", (err) => {
    console.log("[browser:pageerror]", err.message);
  });

  await installWalletMock(page, { signTypedDataThrows: true });

  await page.goto("/");
  await expect(page.getByTestId("seed-prompt-safe")).toBeVisible();
  await page.getByTestId("seed-prompt-safe").click();

  await expect(
    page.locator('[data-testid="chat-card-risk-report"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId("chat-message-wallet-connect-prompt").first(),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("wallet-connect-button").first().click();

  await expect(
    page.getByTestId("chat-message-personal-sign-fallback-notice").first(),
  ).toBeVisible({ timeout: 20_000 });

  await expect(
    page.locator('[data-testid="chat-card-delegation-signed"]').first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('[data-testid="chat-card-receipt"]').first(),
  ).toBeVisible({ timeout: 30_000 });
});
