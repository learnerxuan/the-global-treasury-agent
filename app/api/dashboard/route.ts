import { NextResponse } from "next/server";
import { countWaitingRecords, listReconciliationRuns } from "../../../src/server/reconciliation/runtime-readers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [waiting, runs] = await Promise.all([countWaitingRecords(), listReconciliationRuns()]);
    return NextResponse.json({ waiting, runs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load dashboard state." },
      { status: 500 }
    );
  }
}
