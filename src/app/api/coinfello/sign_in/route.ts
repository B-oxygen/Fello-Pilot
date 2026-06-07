import { NextResponse } from "next/server";
import { runSignIn } from "@/lib/adapters/coinfello";

export async function POST() {
  try {
    const result = await runSignIn();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
