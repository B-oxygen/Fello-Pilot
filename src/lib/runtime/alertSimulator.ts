import { randomUUID } from "node:crypto";
import { buildProposal } from "@/lib/proposal";
import {
  appendCommandLog,
  appendMemoryJsonl,
  readJson,
  writeJson,
  DataFile,
} from "@/lib/store";
import { ALERT_TRIGGER_POLL_INTERVAL_S } from "@/lib/constants";
import type { MemoryEntry, TradeProposal } from "@/types/domain";

const ALERT_STATE_FILE = "alert_state.json";

export interface AlertState {
  parentProposalId: string;
  condition: string;
  pollIntervalSeconds: number;
  startedAt: string;
  status: "armed" | "fired";
  firedAt?: string;
  triggeredProposalId?: string;
  triggeredTraceId?: string;
}

export type AlertStartResult =
  | { ok: true; state: AlertState }
  | { ok: false; code: "NO_PROPOSAL" | "NOT_ALERT"; reason: string };

export async function startAlert(): Promise<AlertStartResult> {
  const proposal = await readJson<TradeProposal | null>(DataFile.Proposal, null);
  if (!proposal) {
    return { ok: false, code: "NO_PROPOSAL", reason: "No proposal in store." };
  }
  if (
    !proposal.executionPolicy ||
    proposal.executionPolicy.type !== "alert_triggered"
  ) {
    return {
      ok: false,
      code: "NOT_ALERT",
      reason: "Active proposal has no alert_triggered executionPolicy.",
    };
  }
  const state: AlertState = {
    parentProposalId: proposal.id,
    condition: proposal.executionPolicy.condition,
    pollIntervalSeconds:
      proposal.executionPolicy.pollIntervalSeconds ||
      ALERT_TRIGGER_POLL_INTERVAL_S,
    startedAt: new Date().toISOString(),
    status: "armed",
  };
  await writeJson(ALERT_STATE_FILE, state);
  await appendCommandLog({
    tool: "api/alert/start",
    stage: "alert_armed",
    proposalId: proposal.id,
    condition: state.condition,
    pollIntervalSeconds: state.pollIntervalSeconds,
  });
  return { ok: true, state };
}

export type TriggerResult =
  | {
      ok: true;
      state: AlertState;
      newProposal: TradeProposal;
    }
  | { ok: false; code: "NO_STATE" | "ALREADY_FIRED" | "NO_PARENT"; reason: string };

export async function simulateTrigger(): Promise<TriggerResult> {
  const state = await readJson<AlertState | null>(ALERT_STATE_FILE, null);
  if (!state) {
    return { ok: false, code: "NO_STATE", reason: "No alert armed." };
  }
  if (state.status === "fired") {
    return {
      ok: false,
      code: "ALREADY_FIRED",
      reason: "Alert has already fired this session.",
    };
  }

  const parent = await readJson<TradeProposal | null>(DataFile.Proposal, null);
  if (!parent || parent.id !== state.parentProposalId) {
    return {
      ok: false,
      code: "NO_PARENT",
      reason: "Parent proposal missing or replaced.",
    };
  }

  const newProposal: TradeProposal = {
    ...buildProposal(parent.parsedIntent),
    proposalSource: parent.proposalSource ?? "rule_based",
    executionPolicy: { type: "oneshot" },
  };

  const triggeredTraceId = `trace_${randomUUID().slice(0, 12)}`;

  await writeJson(DataFile.Proposal, newProposal);

  state.status = "fired";
  state.firedAt = new Date().toISOString();
  state.triggeredProposalId = newProposal.id;
  state.triggeredTraceId = triggeredTraceId;
  await writeJson(ALERT_STATE_FILE, state);

  await appendCommandLog({
    tool: "api/alert/simulate_trigger",
    stage: "alert_fired",
    parentProposalId: state.parentProposalId,
    newProposalId: newProposal.id,
    condition: state.condition,
  });

  const memoryEntry: MemoryEntry = {
    createdAt: state.firedAt,
    proposalId: newProposal.id,
    traceId: triggeredTraceId,
    intent: newProposal.parsedIntent.rawText,
    proposal: {
      chain: newProposal.parsedIntent.chain,
      action: newProposal.parsedIntent.action,
      amount: newProposal.parsedIntent.amount,
      tokenIn: newProposal.parsedIntent.tokenIn,
      tokenOut: newProposal.parsedIntent.tokenOut,
    },
    risk: { verdict: "pass", failedDims: [] },
    delegation: { signed: false },
    execution: {
      adapter: "mock",
      runtimeMode: "SIMULATION",
      simulated: true,
      variant: "simulated_attestation",
      parentProposalId: state.parentProposalId,
    },
    evaluation: { honesty: 5, scope: 4, risk: 5, cost: 5 },
    postmortem: `Alert trigger fired (${state.condition}); fresh proposal spawned.`,
    nextAdjustment:
      "Operator must re-sign delegation for the new proposal; old delegation does NOT pre-authorize.",
  };
  await appendMemoryJsonl(memoryEntry);

  return { ok: true, state, newProposal };
}

export async function getAlertState(): Promise<AlertState | null> {
  return readJson<AlertState | null>(ALERT_STATE_FILE, null);
}
