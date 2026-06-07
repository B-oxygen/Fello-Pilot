import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = "http://localhost:3000";
const CHAIN_ID = 11155111;

const ONESHOT_INTENT =
  "Sepolia testnet에서 1 USDC를 ETH로 스왑하는 데모 자동화 플로우. mainnet 금지. 사람 승인 필수.";
const DCA_INTENT =
  "Sepolia testnet에서 매 5초마다 1 USDC를 ETH로 swap, 총 2번 반복하는 DCA 데모. mainnet 금지. 사람 승인 필수.";
const ALERT_INTENT =
  "Sepolia testnet에서 ETH 가격이 4000 USD 이하로 떨어지면 1 USDC를 ETH로 swap하는 알림 트리거. mainnet 금지. 사람 승인 필수.";

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

async function buildSignVerify(proposal, account) {
  const built = (
    await post("/api/delegation/build", {
      proposal,
      approver: account.address,
      chainId: CHAIN_ID,
    })
  ).json;
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
  const verify = await post("/api/delegation/verify", {
    proposalId: proposal.id,
    approver: account.address,
    chainId: CHAIN_ID,
    signature,
    method: "eth_signTypedData_v4",
    message: built.message,
    personalSignMessage: built.personalSignMessage,
    delegationIntentHash: built.hash,
  });
  if (!verify.json.valid) throw new Error("verify rejected");
}

const account = privateKeyToAccount(generatePrivateKey());

console.log("=== Setup: sign delegation for proposal A (one-shot) ===");
const propA = (await post("/api/proposal", { intent: ONESHOT_INTENT })).json
  .proposal;
console.log("  proposal A:", propA.id, "executionPolicy:", JSON.stringify(propA.executionPolicy ?? { type: "oneshot" }));
await buildSignVerify(propA, account);
console.log("  delegation signed for A");

console.log("\n=== Test 1: overwrite active proposal with DCA proposal B; /api/dca/start MUST reject (delegation belongs to A, not B) ===");
const propB = (await post("/api/proposal", { intent: DCA_INTENT })).json.proposal;
console.log("  proposal B:", propB.id, "executionPolicy:", JSON.stringify(propB.executionPolicy));
const dcaStart = await post("/api/dca/start", null);
console.log("  /api/dca/start:", JSON.stringify(dcaStart.json));

console.log("\n=== Test 2: overwrite active proposal with alert proposal C; /api/alert/start MUST reject ===");
const propC = (await post("/api/proposal", { intent: ALERT_INTENT })).json
  .proposal;
console.log("  proposal C:", propC.id, "executionPolicy:", JSON.stringify(propC.executionPolicy));
const alertStart = await post("/api/alert/start", null);
console.log("  /api/alert/start:", JSON.stringify(alertStart.json));

console.log("\n=== Test 3: full DCA flow rebuilt under proper delegation for B passes (positive control) ===");
const propBfresh = (await post("/api/proposal", { intent: DCA_INTENT })).json
  .proposal;
await buildSignVerify(propBfresh, account);
const dcaStartFresh = await post("/api/dca/start", null);
console.log("  /api/dca/start (fresh delegation):", dcaStartFresh.json.ok);

console.log("\n=== Test 4: DCA tick rejects after delegation swapped mid-flight ===");
const FORGED_DELEGATION = {
  proposalId: "prop_FORGED000000000000000000000000",
  status: "approved",
  adapter: "mock",
  scope: { action: "swap", spendingCap: 1, tokenAllowlist: [], expiryMinutes: 60 },
  message: "forged",
  updatedAt: new Date().toISOString(),
  signatureValid: true,
};
writeFileSync(
  resolve(process.cwd(), "data/delegation_state.json"),
  `${JSON.stringify(FORGED_DELEGATION, null, 2)}\n`,
);
const tickAfterForge = await post("/api/dca/tick", null);
console.log(
  "  /api/dca/tick after forging delegation to a different proposalId:",
  JSON.stringify(tickAfterForge.json),
);

console.log("\n=== Test 5: /api/delegation/verify rejects body.proposalId mismatch against signed message.proposalId ===");
// Sign delegation message for proposal X. Submit verify with body.proposalId=Y
// (same signed message, just lying about which proposalId it binds).
// Server must refuse so the resulting DelegationState is NOT marked approved for Y.
const propX = (await post("/api/proposal", { intent: ONESHOT_INTENT })).json
  .proposal;
const builtX = (
  await post("/api/delegation/build", {
    proposal: propX,
    approver: account.address,
    chainId: CHAIN_ID,
  })
).json;
const sigX = await account.signTypedData({
  domain: builtX.domain,
  types: builtX.types,
  primaryType: builtX.primaryType,
  message: {
    approver: builtX.message.approver,
    action: builtX.message.action,
    tokenAllowlist: builtX.message.tokenAllowlist,
    spendingCap: BigInt(builtX.message.spendingCap),
    expiry: BigInt(builtX.message.expiry),
    proposalId: builtX.message.proposalId,
  },
});
const verifyMismatch = await post("/api/delegation/verify", {
  proposalId: "prop_LIES_ABOUT_BINDING_000000000000",
  approver: account.address,
  chainId: CHAIN_ID,
  signature: sigX,
  method: "eth_signTypedData_v4",
  message: builtX.message,
  personalSignMessage: builtX.personalSignMessage,
  delegationIntentHash: builtX.hash,
});
console.log(
  "  /api/delegation/verify with body.proposalId != signed message.proposalId:",
  JSON.stringify({
    valid: verifyMismatch.json.valid,
    proposalIdBindingValid: verifyMismatch.json.proposalIdBindingValid,
    state_status: verifyMismatch.json.state?.status,
  }),
);

console.log("\n=== Test 6: /api/execute refuses when active proposal != delegation.proposalId ===");
// Sign proposal A delegation honestly. Then swap the active proposal to a
// fresh oneshot B without re-signing. /api/execute must refuse.
const propAfresh = (await post("/api/proposal", { intent: ONESHOT_INTENT })).json
  .proposal;
await buildSignVerify(propAfresh, account);
const propBoneshot = (
  await post("/api/proposal", {
    intent:
      "Sepolia testnet에서 0.5 USDC를 ETH로 단발성 스왑. mainnet 금지. 사람 승인 필수.",
  })
).json.proposal;
const executeMismatch = await post("/api/execute", null);
console.log(
  "  /api/execute under unbound delegation:",
  JSON.stringify(executeMismatch.json).slice(0, 400),
);

console.log("\n=== Assertions ===");
const checks = [
  {
    name: "stale-delegation DCA /start rejected with NO_DELEGATION + clear reason",
    pass:
      dcaStart.status === 400 &&
      dcaStart.json.ok === false &&
      dcaStart.json.code === "NO_DELEGATION" &&
      /different proposal/i.test(dcaStart.json.reason ?? ""),
  },
  {
    name: "stale-delegation alert /start rejected with NO_DELEGATION + clear reason",
    pass:
      alertStart.status === 400 &&
      alertStart.json.ok === false &&
      alertStart.json.code === "NO_DELEGATION" &&
      /different proposal/i.test(alertStart.json.reason ?? ""),
  },
  {
    name: "fresh-delegation DCA /start succeeds (positive control)",
    pass: dcaStartFresh.json.ok === true,
  },
  {
    name: "DCA tick rejects forged/mismatched delegation",
    pass:
      tickAfterForge.status === 400 &&
      tickAfterForge.json.ok === false &&
      tickAfterForge.json.code === "NO_DELEGATION",
  },
  {
    name: "verify route rejects body.proposalId != signed message.proposalId",
    pass:
      verifyMismatch.json.proposalIdBindingValid === false &&
      verifyMismatch.json.valid === false &&
      verifyMismatch.json.state?.status === "rejected",
  },
  {
    name: "execute route refuses unbound active proposal",
    pass:
      executeMismatch.status === 400 &&
      typeof executeMismatch.json.error === "string" &&
      /delegation not signed\/verified for the active proposal/.test(
        executeMismatch.json.error,
      ) &&
      executeMismatch.json.activeProposalId === propBoneshot.id &&
      executeMismatch.json.delegationProposalId === propAfresh.id,
  },
];
let fails = 0;
for (const c of checks) {
  console.log(c.pass ? "  PASS " : "  FAIL ", c.name);
  if (!c.pass) fails++;
}
process.exit(fails === 0 ? 0 : 1);
