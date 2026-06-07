import { NextResponse } from "next/server";
import { startDca } from "@/lib/runtime/dcaScheduler";

export async function POST() {
  const result = await startDca();
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
