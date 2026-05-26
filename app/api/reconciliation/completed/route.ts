import { NextResponse } from "next/server";
import { listCompletedReconciliationRuns } from "../../../../src/server/reconciliation/runtime-readers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const completedRuns = await listCompletedReconciliationRuns();
    return NextResponse.json({ completedRuns });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load completed reconciliations." },
      { status: 500 }
    );
  }
}
