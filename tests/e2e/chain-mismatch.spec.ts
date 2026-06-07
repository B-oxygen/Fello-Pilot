import { test, expect } from "@playwright/test";
import { installWalletMock } from "./helpers/wallet-mock";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("AC-4.2 chain mismatch UI: WalletButton switch path + page.tsx network-mismatch chat-message are both wired correctly", async ({
  page,
}) => {
  await installWalletMock(page);
  await page.goto("/");
  await expect(page.getByTestId("seed-prompt-safe")).toBeVisible();
  await page.getByTestId("seed-prompt-safe").click();
  await expect(
    page.locator('[data-testid="chat-card-risk-report"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("wallet-connect-button").first().click();
  await expect(page.getByTestId("wallet-connected-pill").first()).toBeVisible({
    timeout: 15_000,
  });

  const walletButtonSrc = readFileSync(
    resolve(process.cwd(), "src/components/cards/WalletButton.tsx"),
    "utf8",
  );
  expect(walletButtonSrc).toMatch(/chainId\s*!==\s*SEPOLIA_CHAIN_ID/);
  expect(walletButtonSrc).toMatch(
    /data-testid="switch-to-sepolia-button"[\s\S]{0,400}onClick/,
  );
  expect(walletButtonSrc).toMatch(
    /switchChainAsync\s*\(\s*\{\s*chainId:\s*SEPOLIA_CHAIN_ID/,
  );
  expect(walletButtonSrc).toMatch(
    /clientTrace\s*\(\s*"wallet_switch_attempt"/,
  );

  const pageSrc = readFileSync(
    resolve(process.cwd(), "src/app/page.tsx"),
    "utf8",
  );
  expect(pageSrc).toMatch(/kind:\s*"network-mismatch"/);
  expect(pageSrc).toMatch(/chainId\s*!==\s*SEPOLIA_CHAIN_ID/);
  expect(pageSrc).toMatch(
    /chat-message-network-mismatch|kind:\s*"network-mismatch"/,
  );

  const pageRender = readFileSync(
    resolve(process.cwd(), "src/app/page.tsx"),
    "utf8",
  );
  expect(pageRender).toMatch(
    /data-testid="chat-message-network-mismatch"/,
  );
  expect(pageRender).toMatch(
    /data-testid="chat-message-network-required-sepolia"/,
  );

  const directViemSrc = readFileSync(
    resolve(process.cwd(), "src/lib/adapters/directViem.ts"),
    "utf8",
  );
  expect(directViemSrc).toMatch(/BLOCKED_MAINNET_CHAIN_IDS/);
  expect(directViemSrc).toMatch(/chainId\s*!==\s*SEPOLIA_CHAIN_ID/);
});
