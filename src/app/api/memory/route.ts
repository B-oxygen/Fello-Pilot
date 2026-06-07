import { NextResponse } from "next/server";
import { readMemoryJsonl } from "@/lib/store";
import type { MemoryEntry } from "@/types/domain";

export async function GET() {
  const entries = await readMemoryJsonl<MemoryEntry>();
  return NextResponse.json({ entries });
}
