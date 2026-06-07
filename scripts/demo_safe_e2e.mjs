import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = "http://localhost:3000";

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json() };
}

function loadSafe() {
  const constantsTs = readFileSync(
    resolve(process.cwd(), "src/lib/constants.ts"),
    "utf8",
  );
  const m = constantsTs.match(/SAFE_DEMO_INTENT\s*=\s*\n?\s*"([^"]+)"/);
  if (!m) throw new Error("could not parse SAFE_DEMO_INTENT");
  return m[1];
}

const TEST_PRIVATE_KEY = process.env.FELLOPILOT_DEMO_TEST_KEY ?? generatePrivateKey();
const account = privateKeyToAccount(TEST_PRIVATE_KEY);
const approver = account.address;
const CHAIN_ID = 11155111;

console.log("=== Stage 1: Intent input ===");
const intentText = loadSafe();
console.log("intent:", intentText);

console.log("\n=== Stage 2: Proposal ===");
const propRes = await post("/api/proposal", { intent: intentText });
if (propRes.json.kind !== "parsed") {
  throw new Error(`proposal rejected: ${JSON.stringify(propRes.json)}`);
}
const proposal = propRes.json.proposal;
console.log("proposal.id:", proposal.id);
console.log("action:", proposal.parsedIntent.action);
console.log("chain:", proposal.parsedIntent.chain);

console.log("\n=== Stage 3: Risk review ===");
const riskRes = await post("/api/risk", { proposal });
console.log("verdict:", riskRes.json.verdict);
console.log("dims:", riskRes.json.dimensions.length);
if (riskRes.json.verdict !== "pass") {
  throw new Error("expected risk verdict=pass for SAFE intent");
}

console.log("\n=== Stage 4: Wallet connect (synthetic test wallet) ===");
console.log("approver:", approver);
console.log("chainId:", CHAIN_ID);

console.log("\n=== Stage 5: Build delegation intent + sign EIP-712 ===");
const buildRes = await post("/api/delegation/build", {
  proposal,
  approver,
  chainId: CHAIN_ID,
});
const built = buildRes.json;
console.log("intent hash:", built.hash);

const messageForSigning = {
  approver: built.message.approver,
  action: built.message.action,
  tokenAllowlist: built.message.tokenAllowlist,
  spendingCap: BigInt(built.message.spendingCap),
  expiry: BigInt(built.message.expiry),
  proposalId: built.message.proposalId,
};

const signature = await account.signTypedData({
  domain: built.domain,
  types: built.types,
  primaryType: built.primaryType,
  message: messageForSigning,
});
console.log("signature (first 22 chars):", `${signature.slice(0, 22)}…`);

console.log("\n=== Stage 5b: Server verify signature ===");
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
console.log("valid:", verifyRes.json.valid);
console.log("delegation status:", verifyRes.json.state.status);
if (!verifyRes.json.valid) {
  throw new Error("server verify rejected the typed-data signature");
}

console.log("\n=== Stage 6: Execute (mock adapter → simulated_attestation) ===");
const execRes = await post("/api/execute", null);
const receipt = execRes.json.receipt;
console.log("variant:", receipt.variant);
console.log("adapter:", receipt.adapter);
console.log("runtimeMode:", receipt.runtimeMode);
console.log("simulated:", receipt.simulated);
console.log("txHash:", receipt.txHash);
console.log("explorerUrl:", receipt.explorerUrl);
console.log("txnId:", receipt.txnId);

console.log("\n=== Stage 7: Memory ===");
const memRes = await fetch(`${BASE}/api/memory`).then((r) => r.json());
const latest = memRes.entries.find((e) => e.proposalId === proposal.id);
console.log("memory entry present:", Boolean(latest));
if (latest) {
  console.log("variant in memory:", latest.execution.variant);
  console.log("signed:", latest.delegation.signed);
}

console.log("\n=== Honesty assertions for FULL SAFE e2e ===");
const isReal = receipt.adapter === "direct_viem" && receipt.simulated === false;
const isSim = receipt.adapter === "mock" && receipt.simulated === true;
const sharedChecks = [
  { name: "memory entry recorded", pass: Boolean(latest) },
  {
    name: "memory.delegation.signed === true",
    pass: latest?.delegation.signed === true,
  },
  {
    name: "honesty: never both simulated:true AND a 0x.. txHash",
    pass: !(receipt.simulated === true && /^0x[0-9a-f]{64}$/i.test(receipt.txHash ?? "")),
  },
];
const DELEGATION_MANAGER_ADDRESS = "0xaD12fDC1fF472D54313Be5FCEc7b1D672B59e247";
let checks;
if (isReal) {
  checks = [
    { name: "receipt.variant === real_attestation", pass: receipt.variant === "real_attestation" },
    { name: "receipt.simulated === false", pass: receipt.simulated === false },
    {
      name: "receipt.txHash is 0x[a-f0-9]{64}",
      pass: typeof receipt.txHash === "string" && /^0x[a-f0-9]{64}$/i.test(receipt.txHash),
    },
    {
      name: "receipt.explorerUrl points to sepolia.etherscan.io",
      pass:
        typeof receipt.explorerUrl === "string" &&
        receipt.explorerUrl.startsWith("https://sepolia.etherscan.io/tx/0x"),
    },
    { name: "receipt.adapter === direct_viem", pass: receipt.adapter === "direct_viem" },
    { name: "receipt.runtimeMode === LIVE_TESTNET", pass: receipt.runtimeMode === "LIVE_TESTNET" },
    {
      name: "receipt.contractAddress === DelegationManager (Sepolia 0xaD12...e247)",
      pass:
        typeof receipt.contractAddress === "string" &&
        receipt.contractAddress.toLowerCase() ===
          DELEGATION_MANAGER_ADDRESS.toLowerCase(),
    },
    {
      name: "receipt.contractFunction === 'attestIntent' (ERC-7710-style P1.5)",
      pass: receipt.contractFunction === "attestIntent",
    },
    {
      name: "receipt.contractAudited === false (UNAUDITED testnet contract per PRD §10)",
      pass: receipt.contractAudited === false,
    },
    {
      name: "memory.execution.contractAddress === DelegationManager (durable record)",
      pass:
        latest?.execution?.contractAddress?.toLowerCase() ===
        DELEGATION_MANAGER_ADDRESS.toLowerCase(),
    },
    ...sharedChecks,
  ];
} else if (isSim) {
  checks = [
    { name: "receipt.variant === simulated_attestation", pass: receipt.variant === "simulated_attestation" },
    { name: "receipt.simulated === true", pass: receipt.simulated === true },
    { name: "receipt.txHash undefined", pass: receipt.txHash === undefined },
    { name: "receipt.explorerUrl undefined", pass: receipt.explorerUrl === undefined },
    { name: "receipt.adapter === mock", pass: receipt.adapter === "mock" },
    { name: "receipt.runtimeMode === SIMULATION", pass: receipt.runtimeMode === "SIMULATION" },
    ...sharedChecks,
  ];
} else {
  checks = [
    {
      name: `unexpected adapter/simulated combination (adapter=${receipt.adapter}, simulated=${receipt.simulated})`,
      pass: false,
    },
    ...sharedChecks,
  ];
}
let fails = 0;
for (const c of checks) {
  console.log(c.pass ? "  PASS " : "  FAIL ", c.name);
  if (!c.pass) fails++;
}
process.exit(fails === 0 ? 0 : 1);
