import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { ProofReconciliationRun } from "./waiting-reconciliation";

const defaultExtractedDir = join(/* turbopackIgnore: true */ process.cwd(), "runtime", "extracted");

function resolveExtractedDir(extractedDir?: string): string {
  if (!extractedDir) return defaultExtractedDir;
  return isAbsolute(extractedDir) ? extractedDir : resolve(/* turbopackIgnore: true */ process.cwd(), extractedDir);
}

async function countJsonFiles(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json")).length;
  } catch {
    return 0;
  }
}

async function listJsonFileNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export type WaitingCounts = {
  invoices: number;
  bankTransactions: number;
  paymentProofs: number;
};

// Counts the normalized waiting records persisted on disk. These are the JSON
// files written per record under runtime/extracted/waiting/<role>/.
export async function countWaitingRecords(extractedDir?: string): Promise<WaitingCounts> {
  const dir = resolveExtractedDir(extractedDir);
  const [invoices, bankTransactions, paymentProofs] = await Promise.all([
    countJsonFiles(join(dir, "waiting", "invoices")),
    countJsonFiles(join(dir, "waiting", "bank_transactions")),
    countJsonFiles(join(dir, "waiting", "payment_proofs"))
  ]);
  return { invoices, bankTransactions, paymentProofs };
}

// Reads every persisted reconciliation run so the results table survives a page
// refresh. Runs are returned newest-first.
export async function listReconciliationRuns(extractedDir?: string): Promise<ProofReconciliationRun[]> {
  const runsDir = join(resolveExtractedDir(extractedDir), "reconciliation_runs");
  const fileNames = await listJsonFileNames(runsDir);

  const runs: ProofReconciliationRun[] = [];
  for (const name of fileNames) {
    try {
      const parsed = JSON.parse(await readFile(join(runsDir, name), "utf8")) as ProofReconciliationRun;
      runs.push(parsed);
    } catch {
      // Skip unreadable / malformed run files instead of failing the whole load.
    }
  }

  runs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return runs;
}

// Reads finalized reconciliation reports. New completed reports are stored in
// the same shape as active runs so the dashboard can render them read-only.
export async function listCompletedReconciliationRuns(extractedDir?: string): Promise<ProofReconciliationRun[]> {
  const reportsDir = join(resolveExtractedDir(extractedDir), "completed", "reconciliation_reports");
  const fileNames = await listJsonFileNames(reportsDir);

  const runs: ProofReconciliationRun[] = [];
  for (const name of fileNames) {
    try {
      const parsed = JSON.parse(await readFile(join(reportsDir, name), "utf8")) as Partial<ProofReconciliationRun>;
      if (typeof parsed.runId === "string" && parsed.batch && parsed.reconciliation && parsed.outputPaths) {
        runs.push(parsed as ProofReconciliationRun);
      }
    } catch {
      // Skip unreadable / malformed report files instead of failing the whole load.
    }
  }

  runs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return runs;
}

export async function listRejectedReconciliationRuns(extractedDir?: string): Promise<ProofReconciliationRun[]> {
  const rejectedDir = join(resolveExtractedDir(extractedDir), "rejected", "reconciliation_runs");
  const fileNames = await listJsonFileNames(rejectedDir);

  const runs: ProofReconciliationRun[] = [];
  for (const name of fileNames) {
    try {
      const parsed = JSON.parse(await readFile(join(rejectedDir, name), "utf8")) as ProofReconciliationRun;
      runs.push(parsed);
    } catch {
      // Skip unreadable / malformed run files instead of failing the whole load.
    }
  }

  runs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return runs;
}
