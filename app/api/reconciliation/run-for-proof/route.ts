import { NextResponse } from "next/server";
import { parseSmeToleranceConfig } from "../../../../src/lib/recon/reconciliation/policy";
import { runReconciliationForWaitingProof } from "../../../../src/server/reconciliation/waiting-reconciliation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { proofPath?: unknown; smeConfig?: unknown };
    if (typeof body.proofPath !== "string" || body.proofPath.trim().length === 0) {
      return NextResponse.json({ error: "proofPath is required." }, { status: 400 });
    }

    const smeConfig = parseSmeToleranceConfig(body.smeConfig);
    const result = await runReconciliationForWaitingProof(body.proofPath, {
      trigger: "manual_run_for_proof",
      ...(smeConfig ? { smeConfig } : {})
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run reconciliation for proof." },
      { status: 400 }
    );
  }
}
