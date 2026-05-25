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
  let fileNames: string[];
  try {
    const entries = await readdir(runsDir, { withFileTypes: true });
    fileNames = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name);
  } catch {
    return [];
  }

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
