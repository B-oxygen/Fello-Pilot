import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const DEV_PORT = 3100;
const BASE = `http://localhost:${DEV_PORT}`;
const CHAIN_ID = 11155111;

function loadSafeIntent() {
  const constantsTs = readFileSync(
    resolve(process.cwd(), "src/lib/constants.ts"),
    "utf8",
  );
  const m = constantsTs.match(/SAFE_DEMO_INTENT\s*=\s*\n?\s*"([^"]+)"/);
  if (!m) throw new Error("could not parse SAFE_DEMO_INTENT");
  return m[1];
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
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
      /* keep waiting */
    }
    await sleep(500);
  }
  return false;
}

console.log(
  `=== Spawning isolated dev on :${DEV_PORT} with FELLOPILOT_ADAPTER=direct_viem AND FELLOPILOT_TESTNET_SIGNER_KEY="" (forces adapter fallback) ===`,
);
const env = {
  ...process.env,
  FELLOPILOT_ADAPTER: "direct_viem",
  FELLOPILOT_TESTNET_SIGNER_KEY: "",
  OPENAI_API_KEY: "",
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
};
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

const ready = await waitForReady(BASE, 60_000);
if (!ready) {
  console.error("FAIL: isolated dev server didn't come up in 60s");
  console.error("  stdout tail:", stdoutBuf.slice(-800));
  console.error("  stderr tail:", stderrBuf.slice(-800));
  cleanup();
  process.exit(1);
}
console.log("  isolated dev server ready");

const TEST_PRIVATE_KEY = generatePrivateKey();
const account = privateKeyToAccount(TEST_PRIVATE_KEY);
const approver = account.address;

console.log("\n=== Stage 1-2: Intent + Proposal ===");
const propRes = await post("/api/proposal", { intent: loadSafeIntent() });
if (propRes.json.kind !== "parsed") {
  console.error("FAIL proposal:", JSON.stringify(propRes.json));
  cleanup();
  process.exit(1);
}
const proposal = propRes.json.proposal;

console.log("\n=== Stage 3: Risk ===");
const riskRes = await post("/api/risk", { proposal });
if (riskRes.json.verdict !== "pass") {
  console.error("FAIL: expected risk verdict=pass");
  cleanup();
  process.exit(1);
}

console.log("\n=== Stage 5: Build + sign + verify delegation ===");
const buildRes = await post("/api/delegation/build", {
  proposal,
  approver,
  chainId: CHAIN_ID,
});
const built = buildRes.json;
const signature = await account.signTypedData({
  domain: built.domain,
  types: built.types,
  primaryType: built.primaryType,
  message: {
    approver: built.message.approver,
    action: built.message.action,
    tokenAllowlist: built.message.tokenAllowlist,
    spendingCap: BigInt(built.message.spendingCap),
    expiry: BigInt(built.message.expiry),
    proposalId: built.message.proposalId,
  },
});
const verifyRes = await post("/api/delegation/verify", {
  proposalId: proposal.id,
  approver,
  chainId: CHAIN_ID,
  signature,
  method: "eth_signTypedData_v4",
  message: built.message,
  personalSignMessage: built.personalSignMessage,
  delegationIntentHash: built.hash,
});
if (!verifyRes.json.valid) {
  console.error("FAIL: server verify rejected signature", verifyRes.json);
  cleanup();
  process.exit(1);
}

console.log(
  "\n=== Stage 6: Execute (direct_viem will fail \u2014 no signer key \u2014 must fallback to mock) ===",
);
const execRes = await post("/api/execute");
const { receipt, fallbackTrail } = execRes.json;
console.log("  receipt.variant:", receipt?.variant);
console.log("  receipt.adapter:", receipt?.adapter);
console.log("  receipt.simulated:", receipt?.simulated);
console.log("  receipt.txHash:", receipt?.txHash ?? "undefined");
console.log("  receipt.explorerUrl:", receipt?.explorerUrl ?? "undefined");
console.log("  fallbackTrail:", JSON.stringify(fallbackTrail));

console.log(
  "\n=== Honesty assertions for AC-6.6 adapter fallback (H1 + H2 invariants) ===",
);
const checks = [
  {
    name: "fallbackTrail contains a direct_viem \u2192 mock hop (H2: no silent fallback)",
    pass:
      Array.isArray(fallbackTrail) &&
      fallbackTrail.some(
        (h) => h.from === "direct_viem" && h.to === "mock",
      ),
  },
  {
    name: "fallbackTrail.reason mentions missing signer key (proves WHY)",
    pass:
      Array.isArray(fallbackTrail) &&
      fallbackTrail.some((h) =>
        /SIGNER_KEY|signer key|configured/i.test(h.reason ?? ""),
      ),
  },
  {
    name: "receipt.adapter === 'mock' (fallback adapter, not direct_viem)",
    pass: receipt?.adapter === "mock",
  },
  {
    name: "receipt.variant === 'simulated_attestation' (mock adapter contract)",
    pass: receipt?.variant === "simulated_attestation",
  },
  {
    name: "receipt.simulated === true",
    pass: receipt?.simulated === true,
  },
  {
    name: "H1: receipt.txHash undefined when simulated:true",
    pass: receipt?.txHash === undefined,
  },
  {
    name: "H1: receipt.explorerUrl undefined when simulated:true",
    pass: receipt?.explorerUrl === undefined,
  },
  {
    name: "honesty: never both simulated:true AND a 0x.. txHash",
    pass: !(
      receipt?.simulated === true &&
      typeof receipt?.txHash === "string" &&
      receipt.txHash.startsWith("0x")
    ),
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
    "\n=== Isolated server stderr tail (last 800 chars, debug) ===\n",
    stderrBuf.slice(-800),
  );
}

process.exit(fails === 0 ? 0 : 1);
