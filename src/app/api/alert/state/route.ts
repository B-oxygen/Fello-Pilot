import { NextResponse } from "next/server";
import { getAlertState } from "@/lib/runtime/alertSimulator";

export async function GET() {
  const state = await getAlertState();
  return NextResponse.json({ state });
}
