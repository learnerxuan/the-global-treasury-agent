import { NextResponse } from "next/server";
import { clearLocalReconciliationRuntime } from "../../../../src/server/reconciliation/waiting-reconciliation";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await clearLocalReconciliationRuntime();
    return NextResponse.json({
      ok: true,
      message: "Local ReconPilot runtime data cleared.",
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to clear runtime data." },
      { status: 500 }
    );
  }
}
