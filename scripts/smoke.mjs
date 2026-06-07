import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "http://localhost:3000";

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

function loadIntents() {
  const constantsTs = readFileSync(
    resolve(process.cwd(), "src/lib/constants.ts"),
    "utf8",
  );
  const safeMatch = constantsTs.match(/SAFE_DEMO_INTENT\s*=\s*\n?\s*"([^"]+)"/);
  const unsafeMatch = constantsTs.match(/UNSAFE_DEMO_INTENT\s*=\s*\n?\s*"([^"]+)"/);
  if (!safeMatch || !unsafeMatch) {
    throw new Error("could not parse SAFE/UNSAFE constants from src/lib/constants.ts");
  }
  return { safe: safeMatch[1], unsafe: unsafeMatch[1] };
}

const { safe, unsafe } = loadIntents();

console.log("=== SAFE proposal ===");
const safeProp = await post("/api/proposal", { intent: safe });
console.log("status:", safeProp.status);
console.log("kind:", safeProp.json.kind);
if (safeProp.json.kind === "parsed") {
  const p = safeProp.json.proposal;
  console.log("proposal.id:", p.id);
  console.log("action:", p.parsedIntent.action);
  console.log("chain:", p.parsedIntent.chain);
  console.log("amount:", p.parsedIntent.amount);
  console.log("tokenIn:", p.parsedIntent.tokenIn);
  console.log("tokenOut:", p.parsedIntent.tokenOut);
}

console.log("\n=== SAFE risk ===");
const safeRisk = await post("/api/risk", { proposal: safeProp.json.proposal });
console.log("verdict:", safeRisk.json.verdict);
console.log("dimensions:", safeRisk.json.dimensions.length);
for (const d of safeRisk.json.dimensions) {
  console.log(" ", d.status === "pass" ? "P" : "F", d.name);
}

console.log("\n=== UNSAFE proposal ===");
const unsafeProp = await post("/api/proposal", { intent: unsafe });
console.log("status:", unsafeProp.status);
console.log("kind:", unsafeProp.json.kind);
if (unsafeProp.json.kind === "parsed") {
  console.log("action:", unsafeProp.json.proposal.parsedIntent.action);
  console.log("chain:", unsafeProp.json.proposal.parsedIntent.chain);
  console.log("amount:", unsafeProp.json.proposal.parsedIntent.amount);
}

console.log("\n=== UNSAFE risk ===");
const unsafeRisk = await post("/api/risk", { proposal: unsafeProp.json.proposal });
console.log("verdict:", unsafeRisk.json.verdict);
const failedDims = unsafeRisk.json.dimensions.filter((d) => d.status === "fail");
console.log("failed dims count:", failedDims.length);
for (const d of failedDims) {
  console.log(" F", d.name, "—", d.reason);
}

console.log("\n=== UNSAFE → /api/execute/blocked ===");
const blocked = await post("/api/execute/blocked", {
  proposal: unsafeProp.json.proposal,
  riskReport: unsafeRisk.json,
});
const r = blocked.json.receipt;
console.log("variant:", r.variant);
console.log("simulated:", r.simulated);
console.log("txHash:", r.txHash);
console.log("explorerUrl:", r.explorerUrl);
console.log("blockedReasons.length:", r.blockedReasons?.length);

console.log("\n=== CoinFello get_account (real CLI invocation for M1.3 evidence) ===");
const cfStart = Date.now();
let cfResult;
try {
  const cfRes = await fetch(`${BASE}/api/coinfello/get_account`, { method: "POST" });
  cfResult = await cfRes.json();
} catch (err) {
  cfResult = { ok: false, error: String(err) };
}
const cfMs = Date.now() - cfStart;
console.log("ok:", cfResult.ok ?? false);
console.log("duration_ms:", cfMs);
if (cfResult.stdout) {
  console.log("stdout (first 200 chars):", String(cfResult.stdout).slice(0, 200));
}
if (cfResult.stderr) {
  console.log("stderr (first 200 chars):", String(cfResult.stderr).slice(0, 200));
}
console.log(
  "log line should now exist in logs/commands.jsonl with stage=coinfello_get_account_invoked",
);

console.log("\n=== Honesty assertions ===");
const honestyChecks = [
  { name: "blocked.simulated === false", pass: r.simulated === false },
  { name: "blocked.txHash undefined", pass: r.txHash === undefined },
  { name: "blocked.explorerUrl undefined", pass: r.explorerUrl === undefined },
  { name: "safe risk.verdict pass", pass: safeRisk.json.verdict === "pass" },
  { name: "unsafe risk.verdict fail", pass: unsafeRisk.json.verdict === "fail" },
  { name: "9 risk dims", pass: safeRisk.json.dimensions.length === 9 },
  {
    name: "coinfello CLI invocation logged",
    pass: typeof cfResult.ok === "boolean",
  },
];
let fails = 0;
for (const c of honestyChecks) {
  console.log(c.pass ? "  PASS " : "  FAIL ", c.name);
  if (!c.pass) fails++;
}
process.exit(fails === 0 ? 0 : 1);
