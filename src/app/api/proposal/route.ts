import { NextResponse } from "next/server";
import { parseIntent } from "@/lib/intent";
import { buildProposal } from "@/lib/proposal";
import { appendCommandLog, writeJson, DataFile } from "@/lib/store";
import {
  isLlmConfigured,
  proposeWithLlm,
  type LlmProposalResult,
} from "@/lib/llmProposal";
import type { TradeProposal } from "@/types/domain";

export async function POST(request: Request) {
  const body = (await request.json()) as { intent?: string };
  const raw = body.intent ?? "";

  // E001/E002 must precede any LLM call — never ship secrets/empty input to OpenAI (H4 invariant).
  const parsed = parseIntent(raw);
  if (parsed.kind === "rejected") {
    await appendCommandLog({
      tool: "api/proposal",
      stage: "intent_rejected",
      code: parsed.code,
    });
    return NextResponse.json(
      {
        kind: "rejected",
        code: parsed.code,
        reason: parsed.reason,
      },
      { status: 400 },
    );
  }

  const fallbackTrail: Array<{ from: string; to: string; reason: string }> = [];

  let llmResult: LlmProposalResult | null = null;
  if (isLlmConfigured()) {
    llmResult = await proposeWithLlm(raw);
    if (llmResult.ok) {
      await appendCommandLog({
        tool: "api/proposal",
        stage: "llm_proposal_succeeded",
        model: llmResult.model,
      });
    } else {
      fallbackTrail.push({
        from: "llm",
        to: "rule_based",
        reason: llmResult.reason,
      });
      await appendCommandLog({
        tool: "api/proposal",
        stage: "llm_proposal_fallback",
        code: llmResult.code,
        reason: llmResult.reason,
      });
    }
  } else {
    fallbackTrail.push({
      from: "llm",
      to: "rule_based",
      reason: "OPENAI_API_KEY not configured.",
    });
    await appendCommandLog({
      tool: "api/proposal",
      stage: "llm_unconfigured",
    });
  }

  const llmOk = llmResult !== null && llmResult.ok === true ? llmResult : null;
  const intent = llmOk ? llmOk.intent : parsed.intent;
  const baseProposal = buildProposal(intent);

  const proposal: TradeProposal = {
    ...baseProposal,
    proposalSource: llmOk ? "llm" : "rule_based",
    ...(llmOk && llmOk.executionPolicy.type !== "oneshot"
      ? { executionPolicy: llmOk.executionPolicy }
      : {}),
  };

  await writeJson(DataFile.Proposal, proposal);
  await appendCommandLog({
    tool: "api/proposal",
    stage: "proposal_emitted",
    proposalId: proposal.id,
    action: proposal.parsedIntent.action,
    source: proposal.proposalSource,
    policyType: proposal.executionPolicy?.type ?? "oneshot",
  });

  return NextResponse.json({ kind: "parsed", proposal, fallbackTrail });
}
