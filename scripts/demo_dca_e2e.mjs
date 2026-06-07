import { readFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = "http://localhost:3000";
const DCA_INTENT =
  "Sepolia testnet에서 매 5초마다 1 USDC를 ETH로 swap, 총 2번 반복하는 DCA 데모. mainnet 금지. 사람 승인 필수.";

const account = privateKeyToAccount(generatePrivateKey());
const approver = account.address;
const CHAIN_ID = 11155111;

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

console.log("=== Stage 2: LLM proposal (DCA intent) ===");
const propRes = await post("/api/proposal", { intent: DCA_INTENT });
if (propRes.json.kind !== "parsed") {
  throw new Error(`proposal rejected: ${JSON.stringify(propRes.json)}`);
}
const proposal = propRes.json.proposal;
console.log("  proposal.id:", proposal.id);
console.log("  source:", proposal.proposalSource);
console.log("  action:", proposal.parsedIntent.action);
console.log("  executionPolicy:", JSON.stringify(proposal.executionPolicy));

console.log("\n=== Stage 3: Risk review ===");
const riskRes = await post("/api/risk", { proposal });
console.log("  verdict:", riskRes.json.verdict);
if (riskRes.json.verdict !== "pass") {
  throw new Error("expected DCA risk verdict=pass");
}

console.log("\n=== Stage 5: Build + sign delegation ===");
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
console.log("  signature prefix:", signature.slice(0, 22), "…");

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
console.log("  verify.valid:", verifyRes.json.valid);
if (!verifyRes.json.valid) throw new Error("verify rejected");

console.log("\n=== Stage 6a: /api/dca/start ===");
const startRes = await post("/api/dca/start", null);
const initial = startRes.json.ledger;
console.log(
  "  totalTicks:",
  initial.totalTicks,
  " cadenceSeconds:",
  initial.cadenceSeconds,
  " perTickAmount:",
  initial.perTickAmount,
);

console.log("\n=== Stage 6b: DCA tick loop ===");
const tickReceipts = [];
const blockedTicks = [];
for (let i = 0; i < initial.totalTicks; i++) {
  if (i > 0) {
    await new Promise((r) => setTimeout(r, initial.cadenceSeconds * 1000));
  }
  const tickRes = await post("/api/dca/tick", null);
  const body = tickRes.json;
  if (!body.ok) {
    console.log(`  tick ${i + 1}: API error ${body.code}: ${body.reason}`);
    break;
  }
  if (body.result === "done") {
    console.log("  ledger done at tick", i + 1);
    break;
  }
  if (body.result === "executed") {
    console.log(
      `  tick ${body.ledger.ticksAttempted}/${body.ledger.totalTicks} executed (${body.receipt.variant}, simulated=${body.receipt.simulated}, tickIndex=${body.receipt.tickIndex}/${body.receipt.totalTicks})`,
    );
    tickReceipts.push(body.receipt);
  } else if (body.result === "blocked") {
    console.log(
      `  tick ${body.ledger.ticksAttempted}/${body.ledger.totalTicks} blocked: ${body.failedDims.map((d) => d.name).join(", ")}`,
    );
    blockedTicks.push(body.failedDims);
  }
}

console.log("\n=== Honesty assertions for DCA e2e (SIM) ===");
const checks = [
  {
    name: "LLM correctly produced DCA executionPolicy",
    pass: proposal.executionPolicy?.type === "dca",
  },
  {
    name: "ticks == 2 (per intent)",
    pass: initial.totalTicks === 2,
  },
  {
    name: "executed 2 ticks",
    pass: tickReceipts.length === 2,
  },
  {
    name: "every tick receipt has tickIndex/totalTicks",
    pass: tickReceipts.every(
      (r) => typeof r.tickIndex === "number" && r.totalTicks === 2,
    ),
  },
  {
    name: "every tick receipt is SIMULATION (mock adapter, never fakes txHash)",
    pass: tickReceipts.every(
      (r) =>
        r.adapter === "mock" &&
        r.simulated === true &&
        r.txHash === undefined &&
        r.explorerUrl === undefined,
    ),
  },
  {
    name: "honesty: no tick has both simulated:true AND a 0x.. txHash",
    pass: tickReceipts.every(
      (r) => !(r.simulated === true && /^0x[0-9a-f]{64}$/i.test(r.txHash ?? "")),
    ),
  },
];
let fails = 0;
for (const c of checks) {
  console.log(c.pass ? "  PASS " : "  FAIL ", c.name);
  if (!c.pass) fails++;
}
process.exit(fails === 0 ? 0 : 1);
