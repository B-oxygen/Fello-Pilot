import { NextResponse } from "next/server";
import { getDcaLedger } from "@/lib/runtime/dcaScheduler";

export async function GET() {
  const ledger = await getDcaLedger();
  return NextResponse.json({ ledger });
}
