import { NextResponse } from "next/server";
import { startAlert } from "@/lib/runtime/alertSimulator";

export async function POST() {
  const result = await startAlert();
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
