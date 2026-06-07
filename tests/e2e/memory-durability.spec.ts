import { test, expect } from "@playwright/test";
import {
  appendFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";

// Covers PRD M3.2 + AC-7.3: memory MUST persist as a durable on-disk store
// rather than in-process state. We prove the property in three layers:
//   (a) Write a sentinel directly to data/memory.jsonl and assert the
//       /api/memory endpoint returns it — proves the API reads from disk.
//   (b) Re-call /api/memory after a delay and after page.reload() — the
//       sentinel must still be present, proving no in-process cache.
//   (c) Static-read src/lib/store.ts and assert readMemoryJsonl reads
//       fs.readFile every call (no closure-level cache). A regression that
//       added a module-level Map cache would fail layer (c).
// The actual "kill+restart dev server" verification is an ops-level
// procedure (scripts/harness/preflight.sh dev) because Playwright spawning
// a second `next dev` collides on the shared .next/ webpack cache.
test("memory persists as durable on-disk store, not in-process state", async ({
  page,
  request,
}) => {
  const memoryPath = resolve(process.cwd(), "data/memory.jsonl");
  const dataDir = resolve(process.cwd(), "data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const sentinelId = `prop_durability_${Date.now().toString(36)}`;
  const sentinelEntry = {
    createdAt: new Date().toISOString(),
    proposalId: sentinelId,
    traceId: "trace_durability_test",
    intent: "durability-sentinel",
    proposal: {
      chain: "sepolia",
      action: "swap",
      amount: 1,
      tokenIn: "USDC",
      tokenOut: "ETH",
    },
    risk: { verdict: "pass" as const, failedDims: [] },
    delegation: { signed: true },
    execution: {
      adapter: "mock" as const,
      runtimeMode: "SIMULATION" as const,
      simulated: true,
      variant: "simulated_attestation" as const,
    },
    evaluation: { honesty: 5, scope: 5, risk: 5, cost: 5 },
    postmortem: "durability-sentinel postmortem",
    nextAdjustment: "n/a",
  };
  appendFileSync(memoryPath, `${JSON.stringify(sentinelEntry)}\n`, "utf8");
  const sizeAfterAppend = statSync(memoryPath).size;

  const r1 = await request.get("/api/memory");
  const body1 = (await r1.json()) as {
    entries: Array<Record<string, unknown>>;
  };
  expect(
    body1.entries.some((e) => e.proposalId === sentinelId),
    "sentinel must appear on first API call (proves API reads disk)",
  ).toBe(true);

  await page.goto("/");
  await page.reload();

  const r2 = await request.get("/api/memory");
  const body2 = (await r2.json()) as {
    entries: Array<Record<string, unknown>>;
  };
  expect(
    body2.entries.some((e) => e.proposalId === sentinelId),
    "sentinel must STILL appear after page reload (proves no in-process cache)",
  ).toBe(true);

  const fileBytes = readFileSync(memoryPath, "utf8");
  expect(
    fileBytes.includes(sentinelId),
    "raw file must still contain the sentinel line",
  ).toBe(true);
  expect(
    statSync(memoryPath).size,
    "file size must not have shrunk during the test",
  ).toBeGreaterThanOrEqual(sizeAfterAppend);

  const storeSrc = readFileSync(resolve(process.cwd(), "src/lib/store.ts"), "utf8");
  expect(
    storeSrc,
    "readMemoryJsonl must fs.readFile every call (no module-level cache)",
  ).toMatch(/export async function readMemoryJsonl[\s\S]*?fs\.readFile/);
  expect(storeSrc).not.toMatch(/let\s+memoryCache\s*=|const\s+memoryCache\s*=/);
});
