import { randomUUID } from "node:crypto";
import { executeMock } from "@/lib/adapters/mock";
import { evaluateRisk } from "@/lib/risk";
import {
  appendCommandLog,
  appendMemoryJsonl,
  readJson,
  writeJson,
  DataFile,
} from "@/lib/store";
import { MAX_DCA_TICKS_PER_DELEGATION } from "@/lib/constants";
import type {
  DelegationState,
  ExecutionReceipt,
  MemoryEntry,
  RiskDimension,
  TradeProposal,
} from "@/types/domain";

const DCA_LEDGER_FILE = "dca_ledger.json";

export interface DcaLedgerHistoryItem {
  tick: number;
  attemptedAt: string;
  result: "executed" | "blocked";
  receiptVariant?: string;
  txHash?: string;
  spent?: number;
  failedDims?: string[];
}

export interface DcaLedger {
  proposalId: string;
  totalTicks: number;
  cadenceSeconds: number;
  perTickAmount: number;
  ticksAttempted: number;
  ticksCompleted: number;
  ticksBlocked: number;
  consumedAmount: number;
  startedAt: string;
  lastTickAt?: string;
  status: "running" | "done";
  history: DcaLedgerHistoryItem[];
}

export type StartResult =
  | { ok: true; ledger: DcaLedger }
  | { ok: false; code: "NO_PROPOSAL" | "NOT_DCA" | "NO_DELEGATION"; reason: string };

export async function startDca(): Promise<StartResult> {
  const proposal = await readJson<TradeProposal | null>(DataFile.Proposal, null);
  if (!proposal) {
    return { ok: false, code: "NO_PROPOSAL", reason: "No proposal in store." };
  }
  if (!proposal.executionPolicy || proposal.executionPolicy.type !== "dca") {
    return {
      ok: false,
      code: "NOT_DCA",
      reason: "Active proposal has no DCA executionPolicy.",
    };
  }
  const delegation = await readJson<DelegationState | null>(
    DataFile.DelegationState,
    null,
  );
  // H5 invariant (PRD §2): the signed delegation MUST belong to THIS proposal,
  // not a stale one left in the store from a previous flow. Without this check
  // a fresh proposal could ride a delegation signed for a different proposal.
  if (
    !delegation ||
    delegation.signatureValid !== true ||
    delegation.proposalId !== proposal.id
  ) {
    return {
      ok: false,
      code: "NO_DELEGATION",
      reason:
        delegation && delegation.proposalId !== proposal.id
          ? `Delegation belongs to a different proposal (${delegation.proposalId}); refusing to bind DCA to ${proposal.id}.`
          : "Delegation not signed/verified for this proposal.",
    };
  }

  const totalTicks = Math.min(
    proposal.executionPolicy.ticks,
    MAX_DCA_TICKS_PER_DELEGATION,
  );
  const perTickAmount =
    proposal.delegationPolicy.spendingCap > 0
      ? proposal.delegationPolicy.spendingCap / totalTicks
      : 0;

  const ledger: DcaLedger = {
    proposalId: proposal.id,
    totalTicks,
    cadenceSeconds: proposal.executionPolicy.cadenceSeconds,
    perTickAmount,
    ticksAttempted: 0,
    ticksCompleted: 0,
    ticksBlocked: 0,
    consumedAmount: 0,
    startedAt: new Date().toISOString(),
    status: "running",
    history: [],
  };

  await writeJson(DCA_LEDGER_FILE, ledger);
  await appendCommandLog({
    tool: "api/dca/start",
    stage: "dca_started",
    proposalId: proposal.id,
    totalTicks,
    cadenceSeconds: ledger.cadenceSeconds,
    perTickAmount,
  });

  return { ok: true, ledger };
}

export interface TickExecuted {
  ok: true;
  result: "executed";
  ledger: DcaLedger;
  receipt: ExecutionReceipt;
}

export interface TickBlocked {
  ok: true;
  result: "blocked";
  ledger: DcaLedger;
  failedDims: RiskDimension[];
}

export interface TickDone {
  ok: true;
  result: "done";
  ledger: DcaLedger;
}

export type TickResult =
  | TickExecuted
  | TickBlocked
  | TickDone
  | { ok: false; code: "NO_LEDGER" | "NO_PROPOSAL" | "NO_DELEGATION"; reason: string };

export async function tickDca(): Promise<TickResult> {
  const ledger = await readJson<DcaLedger | null>(DCA_LEDGER_FILE, null);
  if (!ledger) {
    return { ok: false, code: "NO_LEDGER", reason: "No DCA ledger in store." };
  }
  if (ledger.status === "done" || ledger.ticksAttempted >= ledger.totalTicks) {
    return { ok: true, result: "done", ledger };
  }

  const proposal = await readJson<TradeProposal | null>(DataFile.Proposal, null);
  if (!proposal || proposal.id !== ledger.proposalId) {
    return {
      ok: false,
      code: "NO_PROPOSAL",
      reason: "Proposal missing or changed since DCA start.",
    };
  }
  const delegation = await readJson<DelegationState | null>(
    DataFile.DelegationState,
    null,
  );
  // H5 invariant re-checked every tick: delegation must still be signed AND
  // bind the exact ledger.proposalId. Prevents stale-delegation replay after
  // proposal swap mid-flight.
  if (
    !delegation ||
    delegation.signatureValid !== true ||
    delegation.proposalId !== ledger.proposalId
  ) {
    return {
      ok: false,
      code: "NO_DELEGATION",
      reason:
        delegation && delegation.proposalId !== ledger.proposalId
          ? `Delegation no longer binds DCA proposal ${ledger.proposalId} (current delegation proposalId=${delegation.proposalId}).`
          : "Delegation cleared or invalidated during DCA run.",
    };
  }

  const tickNumber = ledger.ticksAttempted + 1;
  const traceId = `trace_${randomUUID().slice(0, 12)}`;
  const nowIso = new Date().toISOString();

  const risk = evaluateRisk(proposal);
  if (risk.verdict === "fail") {
    const failedDims = risk.dimensions.filter((d) => d.status === "fail");
    ledger.ticksAttempted = tickNumber;
    ledger.ticksBlocked += 1;
    ledger.lastTickAt = nowIso;
    ledger.history.push({
      tick: tickNumber,
      attemptedAt: nowIso,
      result: "blocked",
      failedDims: failedDims.map((d) => d.name),
    });
    if (ledger.ticksAttempted >= ledger.totalTicks) ledger.status = "done";
    await writeJson(DCA_LEDGER_FILE, ledger);
    await appendCommandLog({
      tool: "api/dca/tick",
      stage: "dca_tick_blocked",
      proposalId: proposal.id,
      tick: tickNumber,
      totalTicks: ledger.totalTicks,
      failedDims: failedDims.map((d) => d.name),
    });
    return { ok: true, result: "blocked", ledger, failedDims };
  }

  const baseReceipt = await executeMock({ proposal, delegation, traceId });
  const tickReceipt: ExecutionReceipt = {
    ...baseReceipt,
    tickIndex: tickNumber,
    totalTicks: ledger.totalTicks,
  };

  ledger.ticksAttempted = tickNumber;
  ledger.ticksCompleted += 1;
  ledger.consumedAmount += ledger.perTickAmount;
  ledger.lastTickAt = nowIso;
  ledger.history.push({
    tick: tickNumber,
    attemptedAt: nowIso,
    result: "executed",
    receiptVariant: tickReceipt.variant,
    txHash: tickReceipt.txHash,
    spent: ledger.perTickAmount,
  });
  if (ledger.ticksAttempted >= ledger.totalTicks) ledger.status = "done";

  await writeJson(DCA_LEDGER_FILE, ledger);
  await writeJson(DataFile.ExecutionReceipt, tickReceipt);
  await appendCommandLog({
    tool: "api/dca/tick",
    stage: "dca_tick_executed",
    proposalId: proposal.id,
    tick: tickNumber,
    totalTicks: ledger.totalTicks,
    spent: ledger.perTickAmount,
    variant: tickReceipt.variant,
  });

  const memoryEntry: MemoryEntry = {
    createdAt: nowIso,
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
      adapter: tickReceipt.adapter,
      runtimeMode: tickReceipt.runtimeMode,
      simulated: tickReceipt.simulated,
      variant: tickReceipt.variant,
      txHash: tickReceipt.txHash,
      explorerUrl: tickReceipt.explorerUrl,
      tickIndex: tickNumber,
      totalTicks: ledger.totalTicks,
    },
    evaluation: { honesty: 5, scope: 4, risk: 5, cost: 4 },
    postmortem: `DCA tick ${tickNumber}/${ledger.totalTicks} executed (${tickReceipt.variant}).`,
    nextAdjustment: "Continue DCA schedule under same delegation.",
  };
  await appendMemoryJsonl(memoryEntry);

  return { ok: true, result: "executed", ledger, receipt: tickReceipt };
}

export async function getDcaLedger(): Promise<DcaLedger | null> {
  return readJson<DcaLedger | null>(DCA_LEDGER_FILE, null);
}
