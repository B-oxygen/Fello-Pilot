import type {
  RiskDimension,
  RiskReport,
  TradeProposal,
} from "@/types/domain";
import { BLOCKED_MAINNET_CHAIN_IDS } from "@/types/domain";
import {
  MAX_DEMO_AMOUNT,
  MAX_DELEGATION_TTL_MIN,
  MAX_SLIPPAGE_BPS,
  RECIPIENT_ALLOWLIST_DEFAULT,
  SUPPORTED_DEMO_CHAINS,
} from "./constants";

const SUPPORTED_ACTIONS = ["swap", "dca", "alert_triggered"] as const;

const SECRET_PATTERNS: RegExp[] = [
  /private\s*key/i,
  /seed\s*phrase/i,
  /mnemonic/i,
  /--use-unsafe-private-key/i,
  /개인키|시드/i,
];

export function evaluateRisk(proposal: TradeProposal): RiskReport {
  const intent = proposal.parsedIntent;
  const dimensions: RiskDimension[] = [];

  const chainAllowed = SUPPORTED_DEMO_CHAINS.includes(
    intent.chain as (typeof SUPPORTED_DEMO_CHAINS)[number],
  );
  dimensions.push({
    name: "chainAllowed",
    status: chainAllowed ? "pass" : "fail",
    policyValue: SUPPORTED_DEMO_CHAINS.join(","),
    actualValue: intent.chain,
    reason: chainAllowed
      ? "Chain is in the supported demo chain set."
      : `Chain '${intent.chain}' is not in the supported demo chains.`,
  });

  const amountAllowed =
    intent.amount === undefined || intent.amount <= MAX_DEMO_AMOUNT;
  dimensions.push({
    name: "amountAllowed",
    status: amountAllowed ? "pass" : "fail",
    policyValue: MAX_DEMO_AMOUNT,
    actualValue: intent.amount ?? "n/a",
    reason: amountAllowed
      ? "Amount is within demo cap."
      : `Amount ${intent.amount} exceeds the demo cap of ${MAX_DEMO_AMOUNT}.`,
  });

  const approvalRequired = intent.approvalRequired;
  dimensions.push({
    name: "approvalRequired",
    status: approvalRequired ? "pass" : "fail",
    policyValue: "true",
    actualValue: String(approvalRequired),
    reason: approvalRequired
      ? "Intent acknowledges human approval is required."
      : "Auto-approval is forbidden. Every action requires human approval.",
  });

  const proposalRecipientLooksMainnet = BLOCKED_MAINNET_CHAIN_IDS.includes(
    (intent as { chainId?: number }).chainId as never,
  );
  const mainnetPolicySatisfied = intent.forbidsMainnet && !proposalRecipientLooksMainnet;
  dimensions.push({
    name: "mainnetPolicySatisfied",
    status: mainnetPolicySatisfied ? "pass" : "fail",
    policyValue: "no-mainnet",
    actualValue: intent.forbidsMainnet ? "forbids-mainnet" : "permits-mainnet",
    reason: mainnetPolicySatisfied
      ? "Intent explicitly forbids mainnet execution."
      : "Intent permits or routes to mainnet. Blocked.",
  });

  const privateKeySafe = !SECRET_PATTERNS.some((re) => re.test(intent.rawText));
  dimensions.push({
    name: "privateKeySafe",
    status: privateKeySafe ? "pass" : "fail",
    policyValue: "no-secrets",
    actualValue: privateKeySafe ? "clean" : "secrets-detected",
    reason: privateKeySafe
      ? "No seed phrase or private key detected in intent."
      : "Intent contains seed phrase or private key. Refused.",
  });

  const actionSupported = (SUPPORTED_ACTIONS as readonly string[]).includes(intent.action);
  dimensions.push({
    name: "actionSupported",
    status: actionSupported ? "pass" : "fail",
    policyValue: SUPPORTED_ACTIONS.join(","),
    actualValue: intent.action,
    reason: actionSupported
      ? `Action '${intent.action}' is supported.`
      : `Action '${intent.action}' is not in the supported set.`,
  });

  const slippageWithinCap = proposal.estimatedSlippageBps <= MAX_SLIPPAGE_BPS;
  dimensions.push({
    name: "slippageWithinCap",
    status: slippageWithinCap ? "pass" : "fail",
    policyValue: MAX_SLIPPAGE_BPS,
    actualValue: proposal.estimatedSlippageBps,
    reason: slippageWithinCap
      ? `Estimated slippage ${proposal.estimatedSlippageBps} bps within cap ${MAX_SLIPPAGE_BPS} bps.`
      : `Estimated slippage ${proposal.estimatedSlippageBps} bps exceeds cap ${MAX_SLIPPAGE_BPS} bps.`,
  });

  const expiryWithinWindow =
    proposal.delegationPolicy.expiryMinutes <= MAX_DELEGATION_TTL_MIN;
  dimensions.push({
    name: "expiryWithinWindow",
    status: expiryWithinWindow ? "pass" : "fail",
    policyValue: MAX_DELEGATION_TTL_MIN,
    actualValue: proposal.delegationPolicy.expiryMinutes,
    reason: expiryWithinWindow
      ? `Delegation expiry ${proposal.delegationPolicy.expiryMinutes} min within cap.`
      : `Delegation expiry ${proposal.delegationPolicy.expiryMinutes} min exceeds cap ${MAX_DELEGATION_TTL_MIN} min.`,
  });

  const recipientAllowed = RECIPIENT_ALLOWLIST_DEFAULT.includes(proposal.recipient);
  dimensions.push({
    name: "recipientAllowed",
    status: recipientAllowed ? "pass" : "fail",
    policyValue: "allowlist",
    actualValue: proposal.recipient,
    reason: recipientAllowed
      ? "Recipient/router is on the demo allowlist."
      : `Recipient ${proposal.recipient} is not on the demo allowlist.`,
  });

  const failedDims = dimensions.filter((d) => d.status === "fail");
  const verdict: "pass" | "fail" = failedDims.length === 0 ? "pass" : "fail";
  const status: RiskReport["status"] =
    verdict === "pass" ? "NEEDS_APPROVAL" : "REJECTED";

  return {
    proposalId: proposal.id,
    createdAt: new Date().toISOString(),
    status,
    verdict,
    dimensions,
    blockedReasons: failedDims.map((d) => d.reason),
    warnings: [],
  };
}
