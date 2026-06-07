import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // globalSetup + globalTeardown spawn tests/e2e/helpers/sign-server.mjs (a
  // viem-backed signer relay on port 3098) for specs that exercise the
  // wallet mock at tests/e2e/helpers/wallet-mock.ts. The demo-safe-full
  // spec and the 4 AC-specific specs (chain-mismatch, personal-sign,
  // adapter-fallback, llm-timeout) all rely on this. Specs that don't
  // need a mocked wallet (the original 4 shipped specs) simply don't call
  // installWalletMock — they're not affected by the sign-server running.
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
