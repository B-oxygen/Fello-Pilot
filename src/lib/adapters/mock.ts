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

  // Defense-in-depth (H5): even though /api/execute now refuses unbound
  // delegations at the route layer, the adapter MUST also refuse a delegation
  // whose proposalId does not match the proposal it is being asked to execute.
  // Otherwise a future call site that bypasses the route guard could replay
  // a stale signature here.
  if (delegation.proposalId !== proposal.id) {
    return {
      proposalId: proposal.id,
      traceId,
      status: "BLOCKED",
      variant: "blocked",
      adapter: "mock",
      runtimeMode: "BLOCKED",
      simulated: false,
      message: `Execution refused: delegation belongs to ${delegation.proposalId}, not ${proposal.id}.`,
      timestamp,
      blockedReasons: ["delegation_proposal_mismatch"],
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
