import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const OPENAI_MOCK_PORT = 3097;
const DEV_PORT = 3100;
const DEV_BASE = `http://localhost:${DEV_PORT}`;
const HARD_TIMEOUT_MS = 15_000;

function loadSafeIntent() {
  const constantsTs = readFileSync(
    resolve(process.cwd(), "src/lib/constants.ts"),
    "utf8",
  );
  const m = constantsTs.match(/SAFE_DEMO_INTENT\s*=\s*\n?\s*"([^"]+)"/);
  if (!m) throw new Error("could not parse SAFE_DEMO_INTENT");
  return m[1];
}

const SAFE_INTENT = loadSafeIntent();

const openaiMock = createServer((req, res) => {
  console.log(
    `[openai-mock] ${req.method} ${req.url} \u2014 holding open >10s to force E003_LLM_TIMEOUT`,
  );
  setTimeout(() => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "resp_mock_late",
        object: "response",
        output_text: "{}",
      }),
    );
  }, 11_000);
});
openaiMock.listen(OPENAI_MOCK_PORT, () => {
  console.log(`[openai-mock] listening on :${OPENAI_MOCK_PORT}`);
});

console.log(
  `=== Spawning isolated dev server on :${DEV_PORT} with OPENAI_BASE_URL=http://localhost:${OPENAI_MOCK_PORT}/v1 ===`,
);
const env = {
  ...process.env,
  OPENAI_API_KEY: "sk-mock-test-key-not-real",
  OPENAI_BASE_URL: `http://localhost:${OPENAI_MOCK_PORT}/v1`,
  FELLOPILOT_ADAPTER: "",
};
const child = spawn("npx", ["next", "dev", "-p", String(DEV_PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: false,
});

let stdoutBuf = "";
let stderrBuf = "";
child.stdout?.on("data", (c) => {
  stdoutBuf += c.toString();
});
child.stderr?.on("data", (c) => {
  stderrBuf += c.toString();
});

let cleanedUp = false;
const cleanup = () => {
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    child.kill("SIGKILL");
  } catch {
    /* ignore */
  }
  try {
    openaiMock.close();
  } catch {
    /* ignore */
  }
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

async function waitForReady(base, maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${base}/`, { method: "GET" });
      if (res.status === 200) return true;
    } catch {
      /* swallow */
    }
    await sleep(500);
  }
  return false;
}

const ready = await waitForReady(DEV_BASE, 60_000);
if (!ready) {
  console.error("FAIL: isolated dev server didn't come up in 60s");
  console.error("  stdout tail:", stdoutBuf.slice(-800));
  console.error("  stderr tail:", stderrBuf.slice(-800));
  cleanup();
  process.exit(1);
}
console.log("  isolated dev server ready");

console.log(
  `\n=== POST /api/proposal (LLM should timeout after 10s, total must be < ${HARD_TIMEOUT_MS}ms) ===`,
);
const t0 = Date.now();
const res = await fetch(`${DEV_BASE}/api/proposal`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ intent: SAFE_INTENT }),
});
const body = await res.json();
const elapsedMs = Date.now() - t0;
console.log(`  elapsed: ${elapsedMs}ms`);
console.log(`  status: ${res.status}`);
console.log(`  proposalSource: ${body.proposal?.proposalSource}`);
console.log(`  fallbackTrail: ${JSON.stringify(body.fallbackTrail)}`);

console.log("\n=== Honesty assertions for AC-2.2 LLM timeout ===");
const checks = [
  {
    name: `total elapsed ${elapsedMs}ms < ${HARD_TIMEOUT_MS}ms (AC-2.2 15s budget)`,
    pass: elapsedMs < HARD_TIMEOUT_MS,
  },
  {
    name: "proposalSource === 'rule_based' (LLM timed out, fell back)",
    pass: body.proposal?.proposalSource === "rule_based",
  },
  {
    name: "fallbackTrail contains an llm \u2192 rule_based hop",
    pass:
      Array.isArray(body.fallbackTrail) &&
      body.fallbackTrail.some(
        (h) => h.from === "llm" && h.to === "rule_based",
      ),
  },
  {
    name: "fallbackTrail.reason mentions timeout/abort (proves it was timeout, not unconfigured)",
    pass:
      Array.isArray(body.fallbackTrail) &&
      body.fallbackTrail.some((h) =>
        /timeout|timed out|aborted|abort/i.test(h.reason ?? ""),
      ),
  },
  {
    name: "rule-based parser still produces action=swap on fallback",
    pass: body.proposal?.parsedIntent?.action === "swap",
  },
  {
    name: "rule-based parser still produces chain=sepolia on fallback",
    pass: body.proposal?.parsedIntent?.chain === "sepolia",
  },
  {
    name: "honesty (H2): client receives a fallbackTrail entry to render llm-fallback-notice",
    pass: Array.isArray(body.fallbackTrail) && body.fallbackTrail.length > 0,
  },
];

let fails = 0;
for (const c of checks) {
  console.log(c.pass ? "  PASS " : "  FAIL ", c.name);
  if (!c.pass) fails++;
}

cleanup();
await sleep(500);

if (fails !== 0) {
  console.error(
    "\n=== Isolated server stderr tail (last 500 chars, debug) ===\n",
    stderrBuf.slice(-500),
  );
}

process.exit(fails === 0 ? 0 : 1);
