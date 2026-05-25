import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createRuntimeBnmFxProvider, hydrateBnmRatesForBatch } from "../../lib/recon/reconciliation/fx-provider";
import { runReconciliationOrchestrator } from "../../lib/recon/reconciliation/orchestrator";
import { LocalJsonCounterpartyIdentityStore, LocalJsonPaymentApplicationStore } from "../../lib/recon/reconciliation/stores";
import type { OrchestratorOutput, ReconciliationResult, ReconciliationStatus } from "../../lib/recon/reconciliation/types";
import {
  bankStatementTransactionSchema,
  expectedPaymentRecordSchema,
  normalizedPaymentProofRecordSchema
} from "../../lib/recon/schemas";
import type {
  BankStatementTransaction,
  ExpectedPaymentRecord,
  NormalizedInputBatch,
  NormalizedPaymentProofRecord
} from "../../lib/recon/types";

const defaultExtractedDir = join(/* turbopackIgnore: true */ process.cwd(), "runtime", "extracted");

type WaitingRole = "invoice" | "bank_statement" | "payment_proof";

type WaitingRecordEnvelope<T> = {
  stage: "waiting";
  role: WaitingRole;
  ingestionId: string;
  storedAt: string;
  record: T;
};

type StoredWaitingRecord<T> = {
  path: string;
  envelope: WaitingRecordEnvelope<T>;
  record: T;
};

type MovedRecord = {
  role: WaitingRole;
  recordId: string;
  from: string;
  to: string;
};

export type ProofReconciliationRunStatus =
  | "AUTO_MATCHED"
  | "LIKELY_MATCHED"
  | "NEEDS_REVIEW"
  | "UNMATCHED"
  | "NO_PROOF_RECORD";

export type ProofReconciliationRun = {
  runId: string;
  trigger: "payment_proof_uploaded" | "manual_run_for_proof";
  createdAt: string;
  status: ProofReconciliationRunStatus;
  proofId: string | null;
  proofPath: string;
  batch: NormalizedInputBatch;
  reconciliation: OrchestratorOutput;
  selectedResult: ReconciliationResult | null;
  movedRecords: MovedRecord[];
  outputPaths: {
    reconciliationReportPath: string | null;
    discrepancySummaryPath: string | null;
    mockNotificationPath: string | null;
    runPath: string;
  };
  summary: string;
  nextAction: string;
};

export type RunReconciliationForProofOptions = {
  extractedDir?: string;
  trigger?: ProofReconciliationRun["trigger"];
};

function resolveExtractedDir(extractedDir?: string): string {
  if (!extractedDir) return defaultExtractedDir;
  return isAbsolute(extractedDir) ? extractedDir : resolve(/* turbopackIgnore: true */ process.cwd(), extractedDir);
}

function toProjectRelativePath(path: string): string {
  if (!isAbsolute(path)) return path.replace(/\\/g, "/");
  const relativePath = relative(/* turbopackIgnore: true */ process.cwd(), path);
  return relativePath.startsWith("..") ? path.replace(/\\/g, "/") : relativePath.replace(/\\/g, "/");
}

function toAbsoluteProjectPath(path: string): string {
  return isAbsolute(path) ? path : resolve(/* turbopackIgnore: true */ process.cwd(), path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

function parseEnvelope<T>(value: unknown, role: WaitingRole, parser: { parse: (input: unknown) => T }): WaitingRecordEnvelope<T> {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid ${role} waiting record envelope.`);
  }
  const candidate = value as Partial<WaitingRecordEnvelope<unknown>>;
  if (candidate.stage !== "waiting" || candidate.role !== role) {
    throw new Error(`Expected waiting ${role} record.`);
  }
  return {
    stage: "waiting",
    role,
    ingestionId: String(candidate.ingestionId ?? "unknown"),
    storedAt: String(candidate.storedAt ?? new Date().toISOString()),
    record: parser.parse(candidate.record)
  };
}

async function readWaitingRecords<T>(
  dir: string,
  role: WaitingRole,
  parser: { parse: (input: unknown) => T }
): Promise<Array<StoredWaitingRecord<T>>> {
  const paths = await listJsonFiles(dir);
  const records: Array<StoredWaitingRecord<T>> = [];
  for (const path of paths) {
    const envelope = parseEnvelope(await readJson(path), role, parser);
    records.push({ path, envelope, record: envelope.record });
  }
  return records;
}

function newestFirst<T>(records: Array<StoredWaitingRecord<T>>): Array<StoredWaitingRecord<T>> {
  return [...records].sort((a, b) => Date.parse(b.envelope.storedAt) - Date.parse(a.envelope.storedAt));
}

function dedupeByKey<T>(
  records: Array<StoredWaitingRecord<T>>,
  keyFor: (record: T) => string | null
): Array<StoredWaitingRecord<T>> {
  const seen = new Set<string>();
  const deduped: Array<StoredWaitingRecord<T>> = [];
  for (const stored of newestFirst(records)) {
    const key = keyFor(stored.record) ?? `path:${stored.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(stored);
  }
  return deduped;
}

function invoiceBusinessKey(record: ExpectedPaymentRecord): string | null {
  const ref = record.paymentReference.normalized ?? record.invoiceNumber;
  const debtor = record.debtor.normalizedName ?? "";
  return ref ? `invoice:${ref}:${record.amountDue.value}:${record.amountDue.currency}:${debtor}` : null;
}

function bankBusinessKey(record: BankStatementTransaction): string | null {
  const ref = record.normalizedReference ?? record.referenceNo ?? record.acctSvcrRef ?? record.description;
  const date = record.bookingDate.slice(0, 10);
  return ref ? `bank:${ref}:${date}:${record.amount.value}:${record.amount.currency}:${record.creditDebitIndicator}` : null;
}

function proofBusinessKey(record: NormalizedPaymentProofRecord): string | null {
  const ref = record.financialPayload.reference.normalized;
  const amount = record.financialPayload.paidAmount;
  const date = record.financialPayload.paymentDate?.slice(0, 10) ?? "";
  const debtor = record.financialPayload.debtor.normalizedName ?? "";
  return ref && amount ? `proof:${ref}:${date}:${amount.value}:${amount.currency}:${debtor}` : null;
}

function recordId(record: ExpectedPaymentRecord | BankStatementTransaction | NormalizedPaymentProofRecord): string {
  if ("expectedPaymentId" in record) return record.expectedPaymentId;
  if ("internalTxId" in record) return record.internalTxId;
  return record.proofId;
}

function chooseSelectedResult(results: ReconciliationResult[], proofId: string): ReconciliationResult | null {
  const proofResults = results.filter((result) => result.proofId === proofId);
  if (proofResults.length === 0) return null;

  const statusRank: Record<ReconciliationStatus, number> = {
    AUTO_MATCHED: 4,
    LIKELY_MATCHED: 3,
    NEEDS_REVIEW: 2,
    UNMATCHED: 1
  };

  return [...proofResults].sort((a, b) => {
    const rankDelta = statusRank[b.status] - statusRank[a.status];
    return rankDelta !== 0 ? rankDelta : b.score - a.score;
  })[0]!;
}

function statusFromSelectedResult(
  selected: ReconciliationResult | null,
  batch: NormalizedInputBatch
): ProofReconciliationRunStatus {
  if (selected) return selected.status;
  if (batch.bankTransactions.length === 0) return "NEEDS_REVIEW";
  return "UNMATCHED";
}

function buildProofLevelSummary(status: ProofReconciliationRunStatus, selected: ReconciliationResult | null): string {
  if (selected) return selected.explanation;
  if (status === "NEEDS_REVIEW") {
    return "Payment proof was extracted and stored, but no waiting bank statement row is available yet. Upload or import the latest bank statement, then retry reconciliation.";
  }
  if (status === "UNMATCHED") {
    return "Payment proof was extracted and stored, but no plausible waiting invoice and bank statement row combination matched it.";
  }
  return "No payment proof record was available for reconciliation.";
}

function nextActionForStatus(status: ProofReconciliationRunStatus): string {
  if (status === "AUTO_MATCHED") return "Matched records were moved to completed. Review the reconciliation report.";
  if (status === "LIKELY_MATCHED") return "Review the approval prompt before moving records to completed.";
  if (status === "NEEDS_REVIEW") return "Review the discrepancy summary and upload missing evidence if needed.";
  if (status === "UNMATCHED") return "Check the proof reference, customer name, and latest bank statement import.";
  return "Upload a valid payment proof record.";
}

async function moveMatchedRecord<T>(
  recordMap: Map<string, StoredWaitingRecord<T>>,
  role: WaitingRole,
  id: string | undefined,
  completedDir: string
): Promise<MovedRecord | null> {
  if (!id) return null;
  const stored = recordMap.get(id);
  if (!stored) return null;
  const target = join(completedDir, basename(stored.path));
  await mkdir(dirname(target), { recursive: true });
  await rename(stored.path, target);
  return { role, recordId: id, from: toProjectRelativePath(stored.path), to: toProjectRelativePath(target) };
}

async function writeCompletionOutputs(input: {
  extractedDir: string;
  runId: string;
  run: Omit<ProofReconciliationRun, "outputPaths">;
  selectedResult: ReconciliationResult;
  invoiceRecords: Map<string, StoredWaitingRecord<ExpectedPaymentRecord>>;
  bankRecords: Map<string, StoredWaitingRecord<BankStatementTransaction>>;
  proofRecords: Map<string, StoredWaitingRecord<NormalizedPaymentProofRecord>>;
}): Promise<{ reportPath: string; movedRecords: MovedRecord[] }> {
  const completedRoot = join(input.extractedDir, "completed");
  const movedRecords = (
    await Promise.all([
      ...((input.selectedResult.expectedPaymentIds ?? (input.selectedResult.expectedPaymentId ? [input.selectedResult.expectedPaymentId] : [])).map((id) =>
        moveMatchedRecord(input.invoiceRecords, "invoice", id, join(completedRoot, "invoices"))
      )),
      moveMatchedRecord(input.bankRecords, "bank_statement", input.selectedResult.bankTransactionId, join(completedRoot, "bank_transactions")),
      moveMatchedRecord(input.proofRecords, "payment_proof", input.selectedResult.proofId, join(completedRoot, "payment_proofs"))
    ])
  ).filter((value): value is MovedRecord => value !== null);

  const reportPath = join(completedRoot, "reconciliation_reports", `${input.runId}.json`);
  await writeJson(reportPath, {
    reportId: input.runId,
    createdAt: input.run.createdAt,
    status: input.selectedResult.status,
    selectedResult: input.selectedResult,
    movedRecords,
    reconciliation: input.run.reconciliation,
    batchId: input.run.batch.batchId
  });

  return { reportPath: toProjectRelativePath(reportPath), movedRecords };
}

async function writeDiscrepancyOutputs(input: {
  extractedDir: string;
  runId: string;
  run: Omit<ProofReconciliationRun, "outputPaths">;
}): Promise<{ discrepancySummaryPath: string; mockNotificationPath: string }> {
  const discrepancyId = `disc_${input.runId}`;
  const notificationId = `notif_${input.runId}`;
  const discrepancySummaryPath = join(input.extractedDir, "discrepancies", "discrepancy_summaries", `${discrepancyId}.json`);
  const mockNotificationPath = join(input.extractedDir, "discrepancies", "mock_notifications", `${notificationId}.json`);

  await writeJson(discrepancySummaryPath, {
    discrepancyId,
    proofId: input.run.proofId,
    status: input.run.status,
    createdAt: input.run.createdAt,
    summary: input.run.summary,
    selectedResult: input.run.selectedResult,
    possibleReasons: [
      "Bank statement has not been updated yet.",
      "Reference number does not match invoice or bank narration.",
      "Payer name differs across proof, invoice, and bank statement.",
      "FX conversion or fees exceed configured tolerance.",
      "Invoice record has not been imported yet."
    ],
    recommendedActions: [
      input.run.nextAction,
      "Retry reconciliation after importing newer bank transactions.",
      "Manually inspect the closest invoice and bank credit candidates."
    ],
    reconciliation: input.run.reconciliation
  });

  await writeJson(mockNotificationPath, {
    notificationId,
    type: "mock_email",
    to: "finance-team@example.com",
    subject: `ReconPilot needs review: ${input.run.proofId ?? "payment proof"} could not be auto-matched`,
    body: `${input.run.summary}\n\nRecommended next action: ${input.run.nextAction}`
  });

  return {
    discrepancySummaryPath: toProjectRelativePath(discrepancySummaryPath),
    mockNotificationPath: toProjectRelativePath(mockNotificationPath)
  };
}

export async function runReconciliationForWaitingProof(
  proofPath: string,
  options: RunReconciliationForProofOptions = {}
): Promise<ProofReconciliationRun> {
  const extractedDir = resolveExtractedDir(options.extractedDir);
  const absoluteProofPath = toAbsoluteProjectPath(proofPath);
  const runId = `recon_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  const [rawInvoiceRecords, rawBankRecords, rawProofRecords] = await Promise.all([
    readWaitingRecords(join(extractedDir, "waiting", "invoices"), "invoice", expectedPaymentRecordSchema),
    readWaitingRecords(join(extractedDir, "waiting", "bank_transactions"), "bank_statement", bankStatementTransactionSchema),
    readWaitingRecords(join(extractedDir, "waiting", "payment_proofs"), "payment_proof", normalizedPaymentProofRecordSchema)
  ]);

  const proofRecord = rawProofRecords.find((stored) => resolve(stored.path) === resolve(absoluteProofPath));
  if (!proofRecord) {
    const emptyBatch: NormalizedInputBatch = {
      schemaVersion: "1.0.0",
      batchId: runId,
      uploadedAt: createdAt,
      expectedPayments: [],
      bankTransactions: [],
      paymentProofs: [],
      warnings: [],
      timelines: []
    };
    const emptyOutput: OrchestratorOutput = {
      schemaVersion: "1.0.0",
      batchId: runId,
      results: [],
      timeline: [],
      artifactRequests: [],
      humanReviewRequests: [],
      summary: { autoMatched: 0, likelyMatched: 0, needsReview: 0, unmatched: 0 }
    };
    const run: ProofReconciliationRun = {
      runId,
      trigger: options.trigger ?? "manual_run_for_proof",
      createdAt,
      status: "NO_PROOF_RECORD",
      proofId: null,
      proofPath: toProjectRelativePath(absoluteProofPath),
      batch: emptyBatch,
      reconciliation: emptyOutput,
      selectedResult: null,
      movedRecords: [],
      outputPaths: {
        reconciliationReportPath: null,
        discrepancySummaryPath: null,
        mockNotificationPath: null,
        runPath: toProjectRelativePath(join(extractedDir, "reconciliation_runs", `${runId}.json`))
      },
      summary: "No waiting payment proof record was found for this path.",
      nextAction: nextActionForStatus("NO_PROOF_RECORD")
    };
    await writeJson(join(extractedDir, "reconciliation_runs", `${runId}.json`), run);
    return run;
  }

  const invoiceRecords = dedupeByKey(rawInvoiceRecords, invoiceBusinessKey);
  const bankRecords = dedupeByKey(rawBankRecords, bankBusinessKey);
  const allProofRecords = [
    proofRecord,
    ...dedupeByKey(
      rawProofRecords.filter((stored) => resolve(stored.path) !== resolve(absoluteProofPath)),
      proofBusinessKey
    )
  ];

  const batch: NormalizedInputBatch = {
    schemaVersion: "1.0.0",
    batchId: runId,
    uploadedAt: createdAt,
    expectedPayments: invoiceRecords.map((stored) => stored.record),
    bankTransactions: bankRecords.map((stored) => stored.record),
    paymentProofs: [proofRecord.record],
    warnings: [],
    timelines: []
  };

  const applicationStore = new LocalJsonPaymentApplicationStore(join(extractedDir, "payment_applications"));
  const counterpartyIdentityStore = new LocalJsonCounterpartyIdentityStore(join(extractedDir, "counterparties", "counterparty-identities.json"));
  const runtimeFx = createRuntimeBnmFxProvider(join(extractedDir, "fx-cache", "bnm"));
  await hydrateBnmRatesForBatch(batch, runtimeFx.bnmProvider);
  const reconciliation = runReconciliationOrchestrator(batch, {
    paymentApplicationStore: applicationStore,
    counterpartyIdentityStore,
    fxProvider: runtimeFx.provider
  });
  const selectedResult = chooseSelectedResult(reconciliation.results, proofRecord.record.proofId);
  const status = statusFromSelectedResult(selectedResult, batch);
  const summary = buildProofLevelSummary(status, selectedResult);
  const nextAction = nextActionForStatus(status);
  const baseRun = {
    runId,
    trigger: options.trigger ?? "manual_run_for_proof",
    createdAt,
    status,
    proofId: proofRecord.record.proofId,
    proofPath: toProjectRelativePath(absoluteProofPath),
    batch,
    reconciliation,
    selectedResult,
    movedRecords: [] as MovedRecord[],
    summary,
    nextAction
  };

  let reconciliationReportPath: string | null = null;
  let discrepancySummaryPath: string | null = null;
  let mockNotificationPath: string | null = null;
  let movedRecords: MovedRecord[] = [];
  const hasSelectedExpected =
    Boolean(selectedResult?.expectedPaymentId) || Boolean((selectedResult?.expectedPaymentIds?.length ?? 0) > 0);

  if (
    status === "AUTO_MATCHED" &&
    selectedResult &&
    hasSelectedExpected &&
    selectedResult.bankTransactionId &&
    selectedResult.proofId
  ) {
    const completion = await writeCompletionOutputs({
      extractedDir,
      runId,
      run: baseRun,
      selectedResult,
      invoiceRecords: new Map(invoiceRecords.map((stored) => [recordId(stored.record), stored])),
      bankRecords: new Map(bankRecords.map((stored) => [recordId(stored.record), stored])),
      proofRecords: new Map(allProofRecords.map((stored) => [recordId(stored.record), stored]))
    });
    reconciliationReportPath = completion.reportPath;
    movedRecords = completion.movedRecords;
  } else {
    const discrepancy = await writeDiscrepancyOutputs({ extractedDir, runId, run: baseRun });
    discrepancySummaryPath = discrepancy.discrepancySummaryPath;
    mockNotificationPath = discrepancy.mockNotificationPath;
  }

  const runPath = join(extractedDir, "reconciliation_runs", `${runId}.json`);
  const run: ProofReconciliationRun = {
    ...baseRun,
    movedRecords,
    outputPaths: {
      reconciliationReportPath,
      discrepancySummaryPath,
      mockNotificationPath,
      runPath: toProjectRelativePath(runPath)
    }
  };
  await writeJson(runPath, run);
  return run;
}

async function moveJsonFiles(fromDir: string, toDir: string): Promise<void> {
  const paths = await listJsonFiles(fromDir);
  if (paths.length === 0) return;
  await mkdir(toDir, { recursive: true });
  for (const from of paths) {
    await rename(from, join(toDir, basename(from)));
  }
}

// Re-runs reconciliation for every waiting payment proof against the current
// waiting invoices/bank transactions, WITHOUT re-extracting any files. Records
// previously moved to completed are returned to waiting first so the whole set
// is re-evaluated, and stale runs/discrepancies/reports are cleared.
export async function rescanWaitingProofs(
  options: { extractedDir?: string } = {}
): Promise<{ runs: ProofReconciliationRun[] }> {
  const extractedDir = resolveExtractedDir(options.extractedDir);

  await Promise.all([
    moveJsonFiles(join(extractedDir, "completed", "invoices"), join(extractedDir, "waiting", "invoices")),
    moveJsonFiles(join(extractedDir, "completed", "bank_transactions"), join(extractedDir, "waiting", "bank_transactions")),
    moveJsonFiles(join(extractedDir, "completed", "payment_proofs"), join(extractedDir, "waiting", "payment_proofs"))
  ]);

  await Promise.all([
    rm(join(extractedDir, "reconciliation_runs"), { recursive: true, force: true }),
    rm(join(extractedDir, "discrepancies"), { recursive: true, force: true }),
    rm(join(extractedDir, "completed", "reconciliation_reports"), { recursive: true, force: true })
  ]);

  const proofPaths = await listJsonFiles(join(extractedDir, "waiting", "payment_proofs"));
  const runs: ProofReconciliationRun[] = [];
  for (const path of proofPaths) {
    runs.push(await runReconciliationForWaitingProof(path, { extractedDir, trigger: "manual_run_for_proof" }));
  }
  return { runs };
}

export async function clearLocalReconciliationRuntime(input: {
  extractedDir?: string;
  uploadsDir?: string;
} = {}): Promise<{ cleared: string[] }> {
  const extractedDir = resolveExtractedDir(input.extractedDir);
  const uploadsDir = input.uploadsDir
    ? isAbsolute(input.uploadsDir)
      ? input.uploadsDir
      : resolve(/* turbopackIgnore: true */ process.cwd(), input.uploadsDir)
    : join(/* turbopackIgnore: true */ process.cwd(), "runtime", "uploads");
  const targets = [extractedDir, uploadsDir];

  for (const target of targets) {
    await rm(target, { recursive: true, force: true });
  }

  return { cleared: targets.map(toProjectRelativePath) };
}
