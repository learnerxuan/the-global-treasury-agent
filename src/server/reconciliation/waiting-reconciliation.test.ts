import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { cleanNormalizedBatch } from "../../lib/recon/fixtures/normalized/clean";
import { clearLocalReconciliationRuntime, rescanWaitingProofs, runReconciliationForWaitingProof } from "./waiting-reconciliation";
import { listCompletedReconciliationRuns } from "./runtime-readers";

async function writeWaitingRecord(input: {
  extractedDir: string;
  folder: "invoices" | "bank_transactions" | "payment_proofs";
  role: "invoice" | "bank_statement" | "payment_proof";
  id: string;
  record: unknown;
}): Promise<string> {
  const dir = join(input.extractedDir, "waiting", input.folder);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${input.id}.json`);
  await writeFile(
    path,
    `${JSON.stringify(
      {
        stage: "waiting",
        role: input.role,
        ingestionId: "ing_test",
        storedAt: "2026-05-25T00:00:00.000Z",
        record: input.record
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return path;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("runReconciliationForWaitingProof", () => {
  it("auto-matches a proof against waiting invoice and bank transaction, then moves records to completed", async () => {
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-waiting-"));
    const invoice = cleanNormalizedBatch.expectedPayments[0]!;
    const bank = cleanNormalizedBatch.bankTransactions[0]!;
    const proof = cleanNormalizedBatch.paymentProofs[0]!;

    const invoicePath = await writeWaitingRecord({
      extractedDir,
      folder: "invoices",
      role: "invoice",
      id: invoice.expectedPaymentId,
      record: invoice
    });
    const bankPath = await writeWaitingRecord({
      extractedDir,
      folder: "bank_transactions",
      role: "bank_statement",
      id: bank.internalTxId,
      record: bank
    });
    const proofPath = await writeWaitingRecord({
      extractedDir,
      folder: "payment_proofs",
      role: "payment_proof",
      id: proof.proofId,
      record: proof
    });

    const result = await runReconciliationForWaitingProof(proofPath, { extractedDir, trigger: "payment_proof_uploaded" });

    expect(result.status).toBe("AUTO_MATCHED");
    expect(result.selectedResult?.expectedPaymentId).toBe(invoice.expectedPaymentId);
    expect(result.selectedResult?.bankTransactionId).toBe(bank.internalTxId);
    expect(result.selectedResult?.proofId).toBe(proof.proofId);
    expect(result.outputPaths.reconciliationReportPath).toContain("completed/reconciliation_reports");
    expect(result.movedRecords.map((record) => record.recordId).sort()).toEqual(
      [invoice.expectedPaymentId, bank.internalTxId, proof.proofId].sort()
    );

    expect(await exists(invoicePath)).toBe(false);
    expect(await exists(bankPath)).toBe(false);
    expect(await exists(proofPath)).toBe(false);
    await expect(readFile(result.outputPaths.reconciliationReportPath!, "utf8")).resolves.toContain("AUTO_MATCHED");
    const completedReport = JSON.parse(await readFile(result.outputPaths.reconciliationReportPath!, "utf8"));
    expect(completedReport.runId).toBe(result.runId);
    expect(completedReport.batch.paymentProofs[0]?.proofId).toBe(proof.proofId);
  });

  it("keeps completed records and reports separate during rescan", async () => {
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-rescan-"));
    const invoice = cleanNormalizedBatch.expectedPayments[0]!;
    const bank = cleanNormalizedBatch.bankTransactions[0]!;
    const proof = cleanNormalizedBatch.paymentProofs[0]!;

    const invoicePath = await writeWaitingRecord({
      extractedDir,
      folder: "invoices",
      role: "invoice",
      id: invoice.expectedPaymentId,
      record: invoice
    });
    const bankPath = await writeWaitingRecord({
      extractedDir,
      folder: "bank_transactions",
      role: "bank_statement",
      id: bank.internalTxId,
      record: bank
    });
    const proofPath = await writeWaitingRecord({
      extractedDir,
      folder: "payment_proofs",
      role: "payment_proof",
      id: proof.proofId,
      record: proof
    });

    const completed = await runReconciliationForWaitingProof(proofPath, { extractedDir });
    const rescan = await rescanWaitingProofs({ extractedDir });
    const completedRuns = await listCompletedReconciliationRuns(extractedDir);

    expect(completed.status).toBe("AUTO_MATCHED");
    expect(rescan.runs).toHaveLength(0);
    expect(completedRuns.map((run) => run.runId)).toContain(completed.runId);
    expect(await exists(invoicePath)).toBe(false);
    expect(await exists(bankPath)).toBe(false);
    expect(await exists(proofPath)).toBe(false);
    expect(await exists(completed.outputPaths.reconciliationReportPath!)).toBe(true);
  });

  it("keeps an unresolved proof in waiting and writes discrepancy artifacts when no bank credit exists", async () => {
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-waiting-"));
    const proof = cleanNormalizedBatch.paymentProofs[0]!;
    const proofPath = await writeWaitingRecord({
      extractedDir,
      folder: "payment_proofs",
      role: "payment_proof",
      id: proof.proofId,
      record: proof
    });

    const result = await runReconciliationForWaitingProof(proofPath, { extractedDir, trigger: "payment_proof_uploaded" });

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.movedRecords).toHaveLength(0);
    expect(await exists(proofPath)).toBe(true);
    expect(result.outputPaths.discrepancySummaryPath).toContain("discrepancies/discrepancy_summaries");
    expect(result.outputPaths.mockNotificationPath).toContain("discrepancies/mock_notifications");
    await expect(readFile(result.outputPaths.discrepancySummaryPath!, "utf8")).resolves.toContain("Bank statement has not been updated yet");
  });

  it("dedupes repeated waiting uploads by business key before matching", async () => {
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-waiting-"));
    const invoice = cleanNormalizedBatch.expectedPayments[0]!;
    const bank = cleanNormalizedBatch.bankTransactions[0]!;
    const proof = cleanNormalizedBatch.paymentProofs[0]!;
    const duplicateInvoice = { ...invoice, expectedPaymentId: "duplicate_invoice_id" };
    const duplicateBank = { ...bank, internalTxId: "duplicate_bank_id" };

    await writeWaitingRecord({ extractedDir, folder: "invoices", role: "invoice", id: invoice.expectedPaymentId, record: invoice });
    await writeWaitingRecord({ extractedDir, folder: "invoices", role: "invoice", id: duplicateInvoice.expectedPaymentId, record: duplicateInvoice });
    await writeWaitingRecord({ extractedDir, folder: "bank_transactions", role: "bank_statement", id: bank.internalTxId, record: bank });
    await writeWaitingRecord({ extractedDir, folder: "bank_transactions", role: "bank_statement", id: duplicateBank.internalTxId, record: duplicateBank });
    const proofPath = await writeWaitingRecord({
      extractedDir,
      folder: "payment_proofs",
      role: "payment_proof",
      id: proof.proofId,
      record: proof
    });

    const result = await runReconciliationForWaitingProof(proofPath, { extractedDir, trigger: "payment_proof_uploaded" });

    expect(result.status).toBe("AUTO_MATCHED");
    expect(result.reconciliation.summary.autoMatched).toBe(1);
    expect(result.reconciliation.summary.needsReview).toBe(0);
    expect(result.batch.expectedPayments).toHaveLength(1);
    expect(result.batch.bankTransactions.filter((tx) => tx.creditDebitIndicator === "CRDT")).toHaveLength(1);
  });

  it("clears local runtime folders for clean manual demo runs", async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), "reconpilot-runtime-"));
    const extractedDir = join(runtimeDir, "extracted");
    const uploadsDir = join(runtimeDir, "uploads");
    await mkdir(join(extractedDir, "waiting", "invoices"), { recursive: true });
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(join(extractedDir, "waiting", "invoices", "x.json"), "{}", "utf8");
    await writeFile(join(uploadsDir, "upload.pdf"), "pdf", "utf8");

    const result = await clearLocalReconciliationRuntime({ extractedDir, uploadsDir });

    expect(result.cleared).toHaveLength(2);
    expect(await exists(extractedDir)).toBe(false);
    expect(await exists(uploadsDir)).toBe(false);
  });
});
