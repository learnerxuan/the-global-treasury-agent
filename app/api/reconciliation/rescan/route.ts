import { NextResponse } from "next/server";
import { parseSmeToleranceConfig } from "../../../../src/lib/recon/reconciliation/policy";
import { rescanWaitingProofs } from "../../../../src/server/reconciliation/waiting-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { smeConfig?: unknown };
    const smeConfig = parseSmeToleranceConfig(body.smeConfig);
    const result = await rescanWaitingProofs({ ...(smeConfig ? { smeConfig } : {}) });
    const summary = result.runs.reduce<Record<string, number>>((acc, run) => {
      acc[run.status] = (acc[run.status] ?? 0) + 1;
      return acc;
    }, {});
    return NextResponse.json({ ok: true, count: result.runs.length, summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to re-run reconciliation." },
      { status: 500 }
    );
  }
}
