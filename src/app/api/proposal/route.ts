import { NextResponse } from "next/server";
import { parseIntent } from "@/lib/intent";
import { buildProposal } from "@/lib/proposal";
import { appendCommandLog, writeJson, DataFile } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json()) as { intent?: string };
  const raw = body.intent ?? "";

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

  const proposal = buildProposal(parsed.intent);
  await writeJson(DataFile.Proposal, proposal);
  await appendCommandLog({
    tool: "api/proposal",
    stage: "proposal_emitted",
    proposalId: proposal.id,
    action: proposal.parsedIntent.action,
  });

  return NextResponse.json({ kind: "parsed", proposal });
}
