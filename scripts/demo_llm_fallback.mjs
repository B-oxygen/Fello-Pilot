import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TEST_PORT = 3099;
const TEST_BASE = `http://localhost:${TEST_PORT}`;

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

async function postProposal(base, intent) {
  const res = await fetch(`${base}/api/proposal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent }),
  });
  return { status: res.status, json: await res.json() };
}

async function waitForReady(base, maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${base}/`, { method: "GET" });
      if (res.status === 200) return true;
    } catch {
      /* swallow connection refused while spinning up */
    }
    await sleep(500);
  }
  return false;
}

console.log(
  `=== Spawning isolated dev server on port ${TEST_PORT} with OPENAI_API_KEY="" ===`,
);
const env = {
  ...process.env,
  OPENAI_API_KEY: "",
  FELLOPILOT_ADAPTER: "",
};
const child = spawn("npx", ["next", "dev", "-p", String(TEST_PORT)], {
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
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

const ready = await waitForReady(TEST_BASE, 60_000);
if (!ready) {
  console.error("FAIL: isolated dev server didn't come up in 60s");
  console.error(
    "  stdout tail:",
    stdoutBuf.slice(-800).replace(/\n/g, "\n    "),
  );
  console.error(
    "  stderr tail:",
    stderrBuf.slice(-800).replace(/\n/g, "\n    "),
  );
  cleanup();
  process.exit(1);
}
console.log("  isolated dev server ready");

console.log(
  "\n=== POST /api/proposal to isolated server (expecting LLM fallback) ===",
);
const neg = await postProposal(TEST_BASE, SAFE_INTENT);
console.log("  status:", neg.status);
console.log("  proposalSource:", neg.json.proposal?.proposalSource);
console.log("  fallbackTrail:", JSON.stringify(neg.json.fallbackTrail));

console.log("\n=== Honesty assertions for LLM fallback (PRD H2 + AC-2.2) ===");
const checks = [
  {
    name: "proposalSource === 'rule_based' (LLM path skipped)",
    pass: neg.json.proposal?.proposalSource === "rule_based",
  },
  {
    name: "fallbackTrail contains an llm \u2192 rule_based hop",
    pass:
      Array.isArray(neg.json.fallbackTrail) &&
      neg.json.fallbackTrail.some(
        (h) => h.from === "llm" && h.to === "rule_based",
      ),
  },
  {
    name: "rule-based deterministic parser still produces action=swap",
    pass: neg.json.proposal?.parsedIntent?.action === "swap",
  },
  {
    name: "rule-based deterministic parser still produces chain=sepolia",
    pass: neg.json.proposal?.parsedIntent?.chain === "sepolia",
  },
  {
    name: "rule-based parser preserves forbidsMainnet=true",
    pass: neg.json.proposal?.parsedIntent?.forbidsMainnet === true,
  },
  {
    name: "no executionPolicy attached (rule-based produces oneshot implicit)",
    pass: neg.json.proposal?.executionPolicy === undefined,
  },
  {
    name: "honesty (H2): client receives a fallbackTrail entry to render llm-fallback-notice",
    pass:
      Array.isArray(neg.json.fallbackTrail) &&
      neg.json.fallbackTrail.length > 0,
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
