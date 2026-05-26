import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { approveReconciliationRun, rejectReconciliationRun } from "../../../../src/server/reconciliation/waiting-reconciliation";

export const runtime = "nodejs";

const VALID_ACTIONS = new Set(["VIEW_REPORT", "APPROVE_MATCH", "REJECT_MATCH", "REQUEST_MORE_INFO", "MARK_UNRESOLVED", "UPLOAD_MISSING_EVIDENCE", "CREATE_DISCREPANCY_NOTE"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      runId?: unknown;
      proofId?: unknown;
      invoiceLabel?: unknown;
      action?: unknown;
      note?: unknown;
    };

    if (typeof body.runId !== "string" || body.runId.trim().length === 0) {
      return NextResponse.json({ error: "runId is required." }, { status: 400 });
    }
    if (typeof body.action !== "string" || !VALID_ACTIONS.has(body.action)) {
      return NextResponse.json({ error: "Valid action is required." }, { status: 400 });
    }

    const actionId = `action_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const record = {
      actionId,
      createdAt,
      runId: body.runId,
      proofId: typeof body.proofId === "string" ? body.proofId : null,
      invoiceLabel: typeof body.invoiceLabel === "string" ? body.invoiceLabel : null,
      action: body.action,
      note: typeof body.note === "string" ? body.note : null
    };

    const dir = join(process.cwd(), "runtime", "extracted", "human_actions");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${actionId}.json`);
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    const completedRun = 
      body.action === "APPROVE_MATCH" 
        ? await approveReconciliationRun(body.runId) 
        : body.action === "REJECT_MATCH" 
          ? await rejectReconciliationRun(body.runId) 
          : null;

    return NextResponse.json({
      ok: true,
      action: record,
      completedRun,
      message: "Action saved to local audit log."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to record reconciliation action." },
      { status: 500 }
    );
  }
}
