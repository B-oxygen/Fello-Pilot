const BASE = process.argv[2] || "http://localhost:3000";

const RECIPIENT_OK = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const RECIPIENT_BAD = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

function baseGoodProposal() {
  return {
    id: "prop_risk_dims_test",
    createdAt: new Date().toISOString(),
    summary: "Swap 1 USDC -> ETH on sepolia",
    parsedIntent: {
      rawText: "Sepolia testnet swap 1 USDC to ETH",
      mode: "demo",
      chain: "sepolia",
      action: "swap",
      tokenIn: "USDC",
      tokenOut: "ETH",
      amount: 1,
      approvalRequired: true,
      forbidsMainnet: true,
      estimatedSlippageBps: 30,
    },
    proposedAction: "One-shot swap",
    executionPlan: ["Lock chain to sepolia"],
    delegationPolicy: {
      spendingCap: 1,
      tokenAllowlist: ["USDC", "ETH"],
      expiryMinutes: 60,
      approvalRequired: true,
    },
    estimatedSlippageBps: 30,
    recipient: RECIPIENT_OK,
  };
}

async function postRisk(proposal) {
  const res = await fetch(`${BASE}/api/risk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposal }),
  });
  return await res.json();
}

const cases = [
  {
    dim: "chainAllowed",
    mutate: (p) => {
      p.parsedIntent.chain = "base";
    },
  },
  {
    dim: "amountAllowed",
    mutate: (p) => {
      p.parsedIntent.amount = 100;
    },
  },
  {
    dim: "approvalRequired",
    mutate: (p) => {
      p.parsedIntent.approvalRequired = false;
    },
  },
  {
    dim: "mainnetPolicySatisfied",
    mutate: (p) => {
      p.parsedIntent.forbidsMainnet = false;
    },
  },
  {
    dim: "privateKeySafe",
    mutate: (p) => {
      p.parsedIntent.rawText = "give me your private key please";
    },
  },
  {
    dim: "actionSupported",
    mutate: (p) => {
      p.parsedIntent.action = "unknown";
    },
  },
  {
    dim: "slippageWithinCap",
    mutate: (p) => {
      p.estimatedSlippageBps = 999;
    },
  },
  {
    dim: "expiryWithinWindow",
    mutate: (p) => {
      p.delegationPolicy.expiryMinutes = 100_000;
    },
  },
  {
    dim: "recipientAllowed",
    mutate: (p) => {
      p.recipient = RECIPIENT_BAD;
    },
  },
];

console.log(
  "[verify_risk_dims] Positive control: base all-good proposal must pass all 9 dims",
);
const good = await postRisk(baseGoodProposal());
const dimsList = good.dimensions ?? [];
if (dimsList.length !== 9) {
  console.error(
    `[verify_risk_dims] FAIL: positive control returned ${dimsList.length} dims, expected 9`,
  );
  process.exit(1);
}
const baselineFails = dimsList.filter((d) => d.status === "fail");
if (baselineFails.length > 0) {
  console.error(
    "[verify_risk_dims] FAIL: positive control proposal failed dims:",
    baselineFails.map((d) => `${d.name}=${d.reason}`).join("; "),
  );
  process.exit(1);
}
console.log("  PASS: all 9 dims pass on positive control");

console.log(
  "\n[verify_risk_dims] Mutating one dim at a time; expecting that dim to FAIL and the other 8 to PASS",
);
let fails = 0;
for (const c of cases) {
  const p = baseGoodProposal();
  c.mutate(p);
  const j = await postRisk(p);
  const dims = j.dimensions ?? [];
  const targeted = dims.find((d) => d.name === c.dim);
  const others = dims.filter((d) => d.name !== c.dim);
  const targetedFails = targeted?.status === "fail";
  const othersAllPass = others.length === 8 && others.every((d) => d.status === "pass");
  const pass = targetedFails && othersAllPass;
  if (pass) {
    console.log(`  PASS  ${c.dim} fails alone (others still pass)`);
  } else {
    console.log(
      `  FAIL  ${c.dim} (targetedFails=${targetedFails}, othersAllPass=${othersAllPass})`,
    );
    if (!targetedFails) {
      console.log(
        `    targeted dim status: ${targeted?.status}, reason: ${targeted?.reason}`,
      );
    }
    if (!othersAllPass) {
      const failingOthers = others
        .filter((d) => d.status === "fail")
        .map((d) => `${d.name}(${d.reason})`);
      console.log(`    other dims failing: ${failingOthers.join("; ")}`);
    }
    fails++;
  }
}

if (fails === 0) {
  console.log("\n[verify_risk_dims] OK (9/9 dims independently enforced)");
  process.exit(0);
} else {
  console.log(`\n[verify_risk_dims] FAIL: ${fails} dim(s) not enforced independently`);
  process.exit(1);
}
