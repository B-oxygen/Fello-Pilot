import { randomBytes } from "node:crypto";
import type { TradeIntent, TradeProposal } from "@/types/domain";
import {
  DEFAULT_DELEGATION_TTL_MIN,
  MAX_DEMO_AMOUNT,
  RECIPIENT_ALLOWLIST_DEFAULT,
} from "./constants";

function makeProposalId(): string {
  return `prop_${randomBytes(8).toString("hex")}`;
}

export function buildProposal(intent: TradeIntent): TradeProposal {
  const id = makeProposalId();
  const createdAt = new Date().toISOString();

  const recipient =
    intent.chain === "sepolia"
      ? RECIPIENT_ALLOWLIST_DEFAULT[3]
      : "0x0000000000000000000000000000000000000000";

  const tokenAllowlist: string[] = [];
  if (intent.tokenIn) tokenAllowlist.push(intent.tokenIn);
  if (intent.tokenOut) tokenAllowlist.push(intent.tokenOut);

  const summary = buildSummary(intent);
  const proposedAction = buildActionLine(intent);
  const executionPlan = buildPlan(intent);

  return {
    id,
    createdAt,
    summary,
    parsedIntent: intent,
    proposedAction,
    executionPlan,
    delegationPolicy: {
      spendingCap: Math.min(intent.amount ?? 1, MAX_DEMO_AMOUNT),
      tokenAllowlist,
      expiryMinutes: DEFAULT_DELEGATION_TTL_MIN,
      approvalRequired: true,
    },
    estimatedSlippageBps: intent.estimatedSlippageBps ?? 30,
    recipient,
  };
}

function buildSummary(intent: TradeIntent): string {
  const chain = intent.chain === "unknown" ? "(chain unknown)" : intent.chain;
  if (intent.action === "swap") {
    return `Swap ${intent.amount ?? "?"} ${intent.tokenIn ?? "TOKEN_IN"} → ${
      intent.tokenOut ?? "TOKEN_OUT"
    } on ${chain}`;
  }
  if (intent.action === "dca") {
    return `DCA ${intent.tokenIn ?? "TOKEN_IN"} → ${intent.tokenOut ?? "TOKEN_OUT"} on ${chain}`;
  }
  if (intent.action === "alert_triggered") {
    return `Alert-triggered ${intent.tokenIn ?? "TOKEN_IN"} → ${
      intent.tokenOut ?? "TOKEN_OUT"
    } on ${chain}`;
  }
  return `Unknown action on ${chain}`;
}

function buildActionLine(intent: TradeIntent): string {
  switch (intent.action) {
    case "swap":
      return `One-shot swap ${intent.tokenIn ?? ""} → ${intent.tokenOut ?? ""}, capped at ${
        intent.amount ?? "?"
      }`;
    case "dca":
      return `DCA execution policy with periodic ticks under one delegation`;
    case "alert_triggered":
      return `Alert-triggered watcher that spawns a fresh proposal when conditions match`;
    default:
      return "No supported action could be derived from the intent";
  }
}

function buildPlan(intent: TradeIntent): string[] {
  if (intent.action === "swap") {
    return [
      `Lock chain to ${intent.chain}`,
      `Cap spending at ${Math.min(intent.amount ?? 1, MAX_DEMO_AMOUNT)} ${intent.tokenIn ?? ""}`,
      `Require human approval before signing`,
      `Execute via configured adapter (real_attestation on direct_viem; SIMULATION otherwise)`,
      `Record receipt to memory`,
    ];
  }
  return [
    "Compose proposal",
    "Run 9-dimension risk gate",
    "Await delegation signature",
    "Execute under signed cap",
  ];
}
