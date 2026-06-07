import { NextResponse } from "next/server";
import { tickDca } from "@/lib/runtime/dcaScheduler";

export async function POST() {
  const result = await tickDca();
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
