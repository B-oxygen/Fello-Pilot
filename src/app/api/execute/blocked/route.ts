import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  appendCommandLog,
  appendMemoryJsonl,
  writeJson,
  DataFile,
} from "@/lib/store";
import type { ExecutionReceipt, MemoryEntry, RiskReport, TradeProposal } from "@/types/domain";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    proposal: TradeProposal;
    riskReport: RiskReport;
  };
  const traceId = `trace_${randomUUID().slice(0, 12)}`;

  const receipt: ExecutionReceipt = {
    proposalId: body.proposal.id,
    traceId,
    status: "BLOCKED",
    variant: "blocked",
    adapter: "mock",
    runtimeMode: "BLOCKED",
    simulated: false,
    message: "Risk gate blocked this proposal. No signature was issued; no execution occurred.",
    timestamp: new Date().toISOString(),
    chainId: undefined,
    chainName: body.proposal.parsedIntent.chain === "unknown" ? undefined : body.proposal.parsedIntent.chain,
    txnId: undefined,
    txHash: undefined,
    explorerUrl: undefined,
    blockedReasons: body.riskReport.blockedReasons,
  };

  await writeJson(DataFile.ExecutionReceipt, receipt);
  await appendCommandLog({
    tool: "api/execute/blocked",
    stage: "execution_blocked",
    proposalId: body.proposal.id,
    failedDims: body.riskReport.dimensions.filter((d) => d.status === "fail").map((d) => d.name),
  });

  const memoryEntry: MemoryEntry = {
    createdAt: new Date().toISOString(),
    proposalId: body.proposal.id,
    traceId,
    intent: body.proposal.parsedIntent.rawText,
    proposal: {
      chain: body.proposal.parsedIntent.chain,
      action: body.proposal.parsedIntent.action,
      amount: body.proposal.parsedIntent.amount,
      tokenIn: body.proposal.parsedIntent.tokenIn,
      tokenOut: body.proposal.parsedIntent.tokenOut,
    },
    risk: {
      verdict: "fail",
      failedDims: body.riskReport.dimensions.filter((d) => d.status === "fail").map((d) => d.name),
    },
    delegation: { signed: false },
    execution: {
      adapter: "mock",
      runtimeMode: "BLOCKED",
      simulated: false,
      variant: "blocked",
    },
    evaluation: { honesty: 5, scope: 5, risk: 5, cost: 5 },
    postmortem: `Blocked by ${body.riskReport.dimensions.filter((d) => d.status === "fail").length} failing risk dimensions.`,
    nextAdjustment: "Reject intent at source; remind operator that mainnet is forbidden.",
  };
  await appendMemoryJsonl(memoryEntry);
  await appendCommandLog({
    tool: "api/execute/blocked",
    stage: "memory_recorded",
    proposalId: body.proposal.id,
  });

  return NextResponse.json({ receipt });
}
