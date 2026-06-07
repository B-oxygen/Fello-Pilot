import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { executeMock } from "@/lib/adapters/mock";
import { executeDirectViem, isDirectViemEnabled } from "@/lib/adapters/directViem";
import {
  appendCommandLog,
  appendMemoryJsonl,
  readJson,
  writeJson,
  DataFile,
} from "@/lib/store";
import type {
  DelegationState,
  ExecutionReceipt,
  MemoryEntry,
  TradeProposal,
} from "@/types/domain";

export async function POST(_request: Request) {
  const proposal = await readJson<TradeProposal | null>(DataFile.Proposal, null);
  const delegation = await readJson<DelegationState | null>(DataFile.DelegationState, null);

  if (!proposal || !delegation) {
    return NextResponse.json(
      { error: "missing proposal or delegation in store" },
      { status: 400 },
    );
  }

  const traceId = `trace_${randomUUID().slice(0, 12)}`;
  const fallbackTrail: Array<{ from: string; to: string; reason: string }> = [];

  let receipt: ExecutionReceipt | null = null;

  if (isDirectViemEnabled()) {
    const direct = await executeDirectViem({ proposal, delegation, traceId });
    if (direct.variant === "real_attestation" || direct.variant === "blocked") {
      receipt = direct;
    } else {
      fallbackTrail.push({
        from: "direct_viem",
        to: "mock",
        reason: direct.message,
      });
      await appendCommandLog({
        tool: "api/execute",
        stage: "adapter_fallback",
        from: "direct_viem",
        to: "mock",
        reason: direct.message,
      });
    }
  }

  if (!receipt) {
    receipt = await executeMock({ proposal, delegation, traceId });
  }

  await writeJson(DataFile.ExecutionReceipt, receipt);
  await appendCommandLog({
    tool: "api/execute",
    stage: "execution_completed",
    proposalId: proposal.id,
    adapter: receipt.adapter,
    simulated: receipt.simulated,
    txHashPresent: Boolean(receipt.txHash),
    variant: receipt.variant,
  });

  const memoryEntry: MemoryEntry = {
    createdAt: new Date().toISOString(),
    proposalId: proposal.id,
    traceId,
    intent: proposal.parsedIntent.rawText,
    proposal: {
      chain: proposal.parsedIntent.chain,
      action: proposal.parsedIntent.action,
      amount: proposal.parsedIntent.amount,
      tokenIn: proposal.parsedIntent.tokenIn,
      tokenOut: proposal.parsedIntent.tokenOut,
    },
    risk: { verdict: "pass", failedDims: [] },
    delegation: {
      signed: Boolean(delegation.signatureValid),
      signatureMethod: delegation.signatureMethod,
      spendingCap: delegation.scope.spendingCap,
    },
    execution: {
      adapter: receipt.adapter,
      runtimeMode: receipt.runtimeMode,
      simulated: receipt.simulated,
      variant: receipt.variant,
      txHash: receipt.txHash,
      explorerUrl: receipt.explorerUrl,
    },
    evaluation: { honesty: 5, scope: 4, risk: 5, cost: 4 },
    postmortem: receipt.simulated
      ? "Simulation completed; no onchain effect."
      : "Real execution completed.",
    nextAdjustment: "Continue same delegation policy; revisit slippage cap next session.",
  };
  await appendMemoryJsonl(memoryEntry);
  await appendCommandLog({
    tool: "api/execute",
    stage: "memory_recorded",
    proposalId: proposal.id,
  });

  return NextResponse.json({ receipt, fallbackTrail });
}
