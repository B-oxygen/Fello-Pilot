import type {
  DelegationState,
  ExecutionReceipt,
  TradeProposal,
} from "@/types/domain";
import { BLOCKED_MAINNET_CHAIN_IDS } from "@/types/domain";

export function isDirectViemEnabled(): boolean {
  return process.env.FELLOPILOT_ADAPTER === "direct_viem";
}

export async function executeDirectViem(args: {
  proposal: TradeProposal;
  delegation: DelegationState;
  traceId: string;
}): Promise<ExecutionReceipt> {
  const { proposal, delegation, traceId } = args;
  const timestamp = new Date().toISOString();

  const signerKey = process.env.FELLOPILOT_TESTNET_SIGNER_KEY;

  if (!signerKey) {
    return {
      proposalId: proposal.id,
      traceId,
      status: "FAILED",
      variant: "failed",
      adapter: "direct_viem",
      runtimeMode: "BLOCKED",
      simulated: false,
      message:
        "direct_viem requested but FELLOPILOT_TESTNET_SIGNER_KEY is not set. Falling back is plan-side.",
      timestamp,
    };
  }

  if (delegation.chainId && BLOCKED_MAINNET_CHAIN_IDS.includes(delegation.chainId as never)) {
    return {
      proposalId: proposal.id,
      traceId,
      status: "BLOCKED",
      variant: "blocked",
      adapter: "direct_viem",
      runtimeMode: "BLOCKED",
      simulated: false,
      message: `direct_viem refuses mainnet chainId ${delegation.chainId}.`,
      timestamp,
      blockedReasons: ["mainnet chain refused at adapter layer"],
    };
  }

  return {
    proposalId: proposal.id,
    traceId,
    status: "FAILED",
    variant: "failed",
    adapter: "direct_viem",
    runtimeMode: "BLOCKED",
    simulated: false,
    message:
      "direct_viem real attestation path is not implemented in this demo build. " +
      "Spec'd in PRD §6.6; port the reference adapter from the prior-art directory for production.",
    timestamp,
  };
}
