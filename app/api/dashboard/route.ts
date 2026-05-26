import { NextResponse } from "next/server";
import {
  countWaitingRecords,
  listCompletedReconciliationRuns,
  listReconciliationRuns,
  listRejectedReconciliationRuns
} from "../../../src/server/reconciliation/runtime-readers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [waiting, runs, completedRuns, rejectedRuns] = await Promise.all([
      countWaitingRecords(),
      listReconciliationRuns(),
      listCompletedReconciliationRuns(),
      listRejectedReconciliationRuns()
    ]);
    return NextResponse.json({ waiting, runs, completedRuns, rejectedRuns });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load dashboard state." },
      { status: 500 }
    );
  }
}
