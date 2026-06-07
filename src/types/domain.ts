export type ExecutionMode = "demo" | "production";

export type IntentAction = "swap" | "dca" | "alert_triggered" | "unknown";

export type ChainName = "sepolia" | "ethereum" | "base" | "unknown";

export const CHAIN_IDS: Partial<Record<ChainName, number>> = {
  sepolia: 11155111,
  ethereum: 1,
  base: 8453,
};

export const BLOCKED_MAINNET_CHAIN_IDS = [1, 10, 56, 137, 8453, 42161, 59144, 5000] as const;

export interface DelegationPolicy {
  spendingCap: number;
  tokenAllowlist: string[];
  expiryMinutes: number;
  approvalRequired: boolean;
}

export interface TradeIntent {
  rawText: string;
  mode: ExecutionMode;
  chain: ChainName;
  action: IntentAction;
  tokenIn?: string;
  tokenOut?: string;
  amount?: number;
  recipient?: string;
  estimatedSlippageBps?: number;
  approvalRequired: boolean;
  forbidsMainnet: boolean;
}

export interface TradeProposal {
  id: string;
  createdAt: string;
  summary: string;
  parsedIntent: TradeIntent;
  proposedAction: string;
  executionPlan: string[];
  delegationPolicy: DelegationPolicy;
  estimatedSlippageBps: number;
  recipient: string;
}

export type RiskStatus = "APPROVED" | "REJECTED" | "NEEDS_APPROVAL";

export type RiskDimensionName =
  | "chainAllowed"
  | "amountAllowed"
  | "approvalRequired"
  | "mainnetPolicySatisfied"
  | "privateKeySafe"
  | "actionSupported"
  | "slippageWithinCap"
  | "expiryWithinWindow"
  | "recipientAllowed";

export interface RiskDimension {
  name: RiskDimensionName;
  status: "pass" | "fail";
  policyValue: string | number;
  actualValue: string | number;
  reason: string;
}

export interface RiskReport {
  proposalId: string;
  createdAt: string;
  status: RiskStatus;
  verdict: "pass" | "fail";
  dimensions: RiskDimension[];
  blockedReasons: string[];
  warnings: string[];
}

export type AdapterKind = "mock" | "coinfello" | "direct_viem";

export type RuntimeMode = "LIVE_TESTNET" | "SIMULATION" | "BLOCKED";

export type SignatureMethod = "eth_signTypedData_v4" | "personal_sign";

export interface ConnectedWallet {
  eoaAddress: string;
  chainId: number;
  connectedAt: string;
  providerLabel: string;
}

export type DelegationStatus =
  | "none"
  | "wallet_connected"
  | "approved"
  | "rejected";

export interface DelegationState {
  proposalId: string;
  status: DelegationStatus;
  adapter: AdapterKind;
  scope: {
    action: string;
    spendingCap: number;
    tokenAllowlist: string[];
    expiryMinutes: number;
  };
  approvedAt?: string;
  message: string;
  updatedAt: string;
  connectedWallet?: ConnectedWallet;
  approver?: string;
  chainId?: number;
  delegationIntentHash?: string;
  signatureMethod?: SignatureMethod;
  signedAt?: string;
  signatureValid?: boolean;
}

export type ExecutionStatus = "MOCK_EXECUTED" | "SUBMITTED" | "FAILED" | "BLOCKED";

export type ReceiptVariant =
  | "real_attestation"
  | "coinfello_routed"
  | "simulated_attestation"
  | "blocked"
  | "failed";

export interface ExecutionReceipt {
  proposalId: string;
  traceId: string;
  status: ExecutionStatus;
  variant: ReceiptVariant;
  adapter: AdapterKind;
  runtimeMode: RuntimeMode;
  simulated: boolean;
  message: string;
  timestamp: string;
  chainId?: number;
  chainName?: ChainName;
  txnId?: string;
  txHash?: string;
  explorerUrl?: string;
  blockedReasons?: string[];
  rawReceipt?: Record<string, unknown>;
}

export interface MemoryEntry {
  createdAt: string;
  proposalId: string;
  traceId: string;
  intent: string;
  proposal: {
    chain: string;
    action: string;
    amount?: number;
    tokenIn?: string;
    tokenOut?: string;
  };
  risk: { verdict: "pass" | "fail"; failedDims: string[] };
  delegation: {
    signed: boolean;
    signatureMethod?: SignatureMethod;
    spendingCap?: number;
    expiry?: number;
  };
  execution: {
    adapter: AdapterKind;
    runtimeMode: RuntimeMode;
    simulated: boolean;
    variant: ReceiptVariant;
    txHash?: string;
    explorerUrl?: string;
  };
  evaluation: { honesty: number; scope: number; risk: number; cost: number };
  postmortem: string;
  nextAdjustment: string;
}
