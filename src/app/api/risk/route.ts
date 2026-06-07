import { NextResponse } from "next/server";
import { evaluateRisk } from "@/lib/risk";
import { appendCommandLog, writeJson, DataFile } from "@/lib/store";
import type { TradeProposal } from "@/types/domain";

export async function POST(request: Request) {
  const body = (await request.json()) as { proposal?: TradeProposal };
  if (!body.proposal) {
    return NextResponse.json({ error: "proposal missing" }, { status: 400 });
  }
  const report = evaluateRisk(body.proposal);
  await writeJson(DataFile.RiskReport, report);
  await appendCommandLog({
    tool: "api/risk",
    stage: "risk_evaluated",
    proposalId: body.proposal.id,
    verdict: report.verdict,
    failedDims: report.dimensions.filter((d) => d.status === "fail").map((d) => d.name),
  });
  return NextResponse.json(report);
}
