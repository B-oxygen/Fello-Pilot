import { NextResponse } from "next/server";
import { buildDelegationIntent, serializeBuiltIntent } from "@/lib/delegation";
import { SEPOLIA_CHAIN_ID } from "@/lib/constants";
import { appendCommandLog } from "@/lib/store";
import type { TradeProposal } from "@/types/domain";
import type { Address } from "viem";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    proposal?: TradeProposal;
    approver?: string;
    chainId?: number;
  };
  if (!body.proposal || !body.approver) {
    return NextResponse.json({ error: "proposal or approver missing" }, { status: 400 });
  }
  const built = buildDelegationIntent({
    proposal: body.proposal,
    approver: body.approver as Address,
    chainId: body.chainId ?? SEPOLIA_CHAIN_ID,
  });
  await appendCommandLog({
    tool: "api/delegation/build",
    stage: "delegation_intent_built",
    proposalId: body.proposal.id,
    chainId: built.domain.chainId,
  });
  return NextResponse.json(serializeBuiltIntent(built));
}
