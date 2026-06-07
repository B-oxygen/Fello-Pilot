import { test, expect } from "@playwright/test";
import {
  appendFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

// Covers PRD M3.2 + AC-7.3 (docs/PRD.md line 711 + 448): memory MUST persist
// across a dev-server kill+restart, proving the store is on disk rather than
// in process memory. We spawn an isolated dev server on port 3097 with
// FELLOPILOT_ADAPTER="" and OPENAI_API_KEY="" so the main dev server on :3000
// stays untouched. The flow: seed a sentinel into data/memory.jsonl, verify
// via the isolated server's /api/memory, KILL the isolated server, RESTART
// it, then verify the sentinel is still returned by the new process.

const ISO_PORT = 3097;
const ISO_BASE = `http://localhost:${ISO_PORT}`;

async function waitReady(base: string, maxMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${base}/`);
      if (res.status === 200) return true;
    } catch {
      /* keep waiting */
    }
    await sleep(500);
  }
  return false;
}

function spawnIsolatedDevServer() {
  const env = {
    ...process.env,
    OPENAI_API_KEY: "",
    FELLOPILOT_ADAPTER: "",
  };
  return spawn("npx", ["next", "dev", "-p", String(ISO_PORT)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
}

test("memory persists across actual dev-server kill+restart (isolated)", async ({}, testInfo) => {
  testInfo.setTimeout(120_000);

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

  let child = spawnIsolatedDevServer();
  try {
    expect(await waitReady(ISO_BASE)).toBe(true);
    const r1 = await fetch(`${ISO_BASE}/api/memory`);
    const j1 = (await r1.json()) as { entries: Array<{ proposalId: string }> };
    expect(j1.entries.some((e) => e.proposalId === sentinelId)).toBe(true);

    child.kill("SIGKILL");
    await sleep(1500);

    child = spawnIsolatedDevServer();
    expect(await waitReady(ISO_BASE)).toBe(true);
    const r2 = await fetch(`${ISO_BASE}/api/memory`);
    const j2 = (await r2.json()) as { entries: Array<{ proposalId: string }> };
    expect(j2.entries.some((e) => e.proposalId === sentinelId)).toBe(true);
  } finally {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    await sleep(500);
  }
});
