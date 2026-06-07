import { NextResponse } from "next/server";
import { appendCommandLog } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const stage = typeof body.stage === "string" ? body.stage : "client_event";
  const tool = typeof body.tool === "string" ? body.tool : "client";
  await appendCommandLog({ tool, stage, ...body });
  return NextResponse.json({ ok: true });
}
