import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // globalSetup + globalTeardown are wired but disabled by default. They
  // spawn tests/e2e/helpers/sign-server.mjs (a viem-backed signer relay) for
  // any spec that wants to exercise the wallet mock at tests/e2e/helpers/
  // wallet-mock.ts. The 4 shipped specs don't currently use them; opt in by
  // uncommenting the two lines below when adding a wallet-mocked spec.
  // globalSetup: "./tests/e2e/global-setup.ts",
  // globalTeardown: "./tests/e2e/global-teardown.ts",
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
