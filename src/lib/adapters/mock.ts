import { randomUUID } from "node:crypto";
import type { DelegationState, ExecutionReceipt, TradeProposal } from "@/types/domain";

export async function executeMock(args: {
  proposal: TradeProposal;
  delegation: DelegationState;
  traceId: string;
}): Promise<ExecutionReceipt> {
  const { proposal, delegation, traceId } = args;
  const timestamp = new Date().toISOString();

  if (delegation.status !== "approved" || delegation.signatureValid !== true) {
    return {
      proposalId: proposal.id,
      traceId,
      status: "BLOCKED",
      variant: "blocked",
      adapter: "mock",
      runtimeMode: "BLOCKED",
      simulated: false,
      message: "Execution refused: delegation not approved or signature invalid.",
      timestamp,
      blockedReasons: ["delegation not approved"],
    };
  }

  await new Promise((resolve) => setTimeout(resolve, 200));

  const txnId = `sim_${randomUUID().slice(0, 12)}`;

  return {
    proposalId: proposal.id,
    traceId,
    status: "MOCK_EXECUTED",
    variant: "simulated_attestation",
    adapter: "mock",
    runtimeMode: "SIMULATION",
    simulated: true,
    message: `SIMULATION — no onchain transaction was sent. Receipt for "${proposal.summary}".`,
    timestamp,
    chainId: proposal.parsedIntent.chain === "sepolia" ? 11155111 : undefined,
    chainName: proposal.parsedIntent.chain === "unknown" ? undefined : proposal.parsedIntent.chain,
    txnId,
    txHash: undefined,
    explorerUrl: undefined,
    rawReceipt: {
      simulated: true,
      mode: proposal.parsedIntent.mode,
      chain: proposal.parsedIntent.chain,
      action: proposal.parsedIntent.action,
      amount: proposal.parsedIntent.amount,
      tokenIn: proposal.parsedIntent.tokenIn,
      tokenOut: proposal.parsedIntent.tokenOut,
      delegationPolicy: proposal.delegationPolicy,
      delegationStatus: delegation.status,
      simulatedTxnId: txnId,
      signatureMethod: delegation.signatureMethod ?? "unknown",
    },
  };
}
