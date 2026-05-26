"use client";

import { createContext, type FormEvent, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DocumentRole, ReconciliationRun, RoleApiResult, UploadKey, UploadStatus } from "./types";
import { useSmeSettings } from "./SmeSettingsContext";

export type CardConfig = {
  key: UploadKey;
  role: DocumentRole;
  title: string;
  endpoint: string;
};

export type WaitingCounts = {
  invoices: number;
  bankTransactions: number;
  paymentProofs: number;
};

export const EMPTY_WAITING: WaitingCounts = {
  invoices: 0,
  bankTransactions: 0,
  paymentProofs: 0
};

const EMPTY_FILES: Record<UploadKey, File[]> = {
  invoices: [],
  bankStatements: [],
  paymentProofs: []
};

const READY_STATUSES: Record<UploadKey, UploadStatus> = {
  invoices: "ready",
  bankStatements: "ready",
  paymentProofs: "ready"
};

const EMPTY_MESSAGES: Record<UploadKey, string | null> = {
  invoices: null,
  bankStatements: null,
  paymentProofs: null
};

export const DASHBOARD_CARDS: CardConfig[] = [
  { key: "invoices", role: "invoice", title: "Invoices", endpoint: "/api/invoices/extractions" },
  { key: "bankStatements", role: "bank_statement", title: "Bank Statements", endpoint: "/api/bank-statements/extractions" },
  { key: "paymentProofs", role: "payment_proof", title: "Payment Proofs", endpoint: "/api/payment-proofs/extractions" }
];

type DashboardContextValue = {
  files: Record<UploadKey, File[]>;
  statuses: Record<UploadKey, UploadStatus>;
  errors: Record<UploadKey, string | null>;
  notices: Record<UploadKey, string | null>;
  waiting: WaitingCounts;
  runs: ReconciliationRun[];
  completedRuns: ReconciliationRun[];
  rejectedRuns: ReconciliationRun[];
  hydrating: boolean;
  clearing: boolean;
  resetMessage: string | null;
  resetError: boolean;
  rescanning: boolean;
  loadDashboard: () => Promise<void>;
  submitUpload: (event: FormEvent<HTMLFormElement>, card: CardConfig) => Promise<void>;
  clearDemoData: () => Promise<void>;
  rescan: () => Promise<void>;
  setFilesFor: (key: UploadKey, selected: File[]) => void;
  storedFor: (key: UploadKey) => number;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { config: smeConfig } = useSmeSettings();
  const [files, setFiles] = useState<Record<UploadKey, File[]>>(EMPTY_FILES);
  const [statuses, setStatuses] = useState<Record<UploadKey, UploadStatus>>(READY_STATUSES);
  const [errors, setErrors] = useState<Record<UploadKey, string | null>>(EMPTY_MESSAGES);
  const [notices, setNotices] = useState<Record<UploadKey, string | null>>(EMPTY_MESSAGES);
  const [waiting, setWaiting] = useState<WaitingCounts>(EMPTY_WAITING);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [completedRuns, setCompletedRuns] = useState<ReconciliationRun[]>([]);
  const [rejectedRuns, setRejectedRuns] = useState<ReconciliationRun[]>([]);
  const [hydrating, setHydrating] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as {
        waiting?: WaitingCounts;
        runs?: ReconciliationRun[];
        completedRuns?: ReconciliationRun[];
        rejectedRuns?: ReconciliationRun[];
      };
      setWaiting(body.waiting ?? EMPTY_WAITING);
      setRuns(body.runs ?? []);
      setCompletedRuns(body.completedRuns ?? []);
      setRejectedRuns(body.rejectedRuns ?? []);
    } catch {
      // Network/disk read failed; leave current state untouched.
    } finally {
      setHydrating(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const setFilesFor = useCallback((key: UploadKey, selected: File[]) => {
    setFiles((current) => ({ ...current, [key]: selected }));
  }, []);

  const storedFor = useCallback(
    (key: UploadKey): number => {
      if (key === "invoices") return waiting.invoices;
      if (key === "bankStatements") return waiting.bankTransactions;
      return waiting.paymentProofs;
    },
    [waiting]
  );

  const submitUpload = useCallback(
    async (event: FormEvent<HTMLFormElement>, card: CardConfig) => {
      event.preventDefault();
      const selected = files[card.key];
      if (selected.length === 0) {
        setStatuses((current) => ({ ...current, [card.key]: "error" }));
        setErrors((current) => ({ ...current, [card.key]: "Select at least one file." }));
        return;
      }

      const formData = new FormData();
      for (const file of selected) {
        formData.append("files", file);
      }
      if (card.key === "paymentProofs") {
        formData.append("smeConfig", JSON.stringify(smeConfig));
      }

      setStatuses((current) => ({ ...current, [card.key]: "pending" }));
      setErrors((current) => ({ ...current, [card.key]: null }));
      setNotices((current) => ({ ...current, [card.key]: null }));

      try {
        const response = await fetch(card.endpoint, { method: "POST", body: formData });
        const body = await response.json();
        if (!response.ok) {
          setStatuses((current) => ({ ...current, [card.key]: "error" }));
          setErrors((current) => ({ ...current, [card.key]: body.error ?? "Extraction failed." }));
          return;
        }
        try {
          const previous = JSON.parse(sessionStorage.getItem("reconpilot:results") ?? "{}");
          sessionStorage.setItem("reconpilot:results", JSON.stringify({ ...previous, [card.key]: body as RoleApiResult }));
        } catch {
          // sessionStorage optional
        }
        const summary = (body as RoleApiResult).extractionSummary;
        if (summary && summary.failed > 0) {
          setNotices((current) => ({
            ...current,
            [card.key]: `Extracted ${summary.extracted} of ${summary.total} file(s). ${summary.failed} failed (rate limit or unreadable) - re-upload the failed file(s) to retry.`
          }));
        }
        setStatuses((current) => ({ ...current, [card.key]: "done" }));
        setFiles((current) => ({ ...current, [card.key]: [] }));
        await loadDashboard();
      } catch (error) {
        setStatuses((current) => ({ ...current, [card.key]: "error" }));
        setErrors((current) => ({
          ...current,
          [card.key]: error instanceof Error ? error.message : "Network error during extraction."
        }));
      }
    },
    [files, loadDashboard, smeConfig]
  );

  const clearDemoData = useCallback(async () => {
    setClearing(true);
    setResetMessage(null);
    setResetError(false);
    try {
      const response = await fetch("/api/dev/clear-runtime", { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        setResetError(true);
        setResetMessage(body.error ?? "Unable to clear demo data.");
        return;
      }
      setFiles(EMPTY_FILES);
      setStatuses(READY_STATUSES);
      setErrors(EMPTY_MESSAGES);
      setNotices(EMPTY_MESSAGES);
      setWaiting(EMPTY_WAITING);
      setRuns([]);
      setCompletedRuns([]);
      setRejectedRuns([]);
      try {
        sessionStorage.removeItem("reconpilot:results");
      } catch {
        // ignore
      }
      setResetMessage("Demo data cleared.");
    } catch (error) {
      setResetError(true);
      setResetMessage(error instanceof Error ? error.message : "Unable to clear demo data.");
    } finally {
      setClearing(false);
    }
  }, []);

  const rescan = useCallback(async () => {
    setRescanning(true);
    setResetMessage(null);
    setResetError(false);
    try {
      const response = await fetch("/api/reconciliation/rescan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smeConfig })
      });
      const body = await response.json();
      if (!response.ok) {
        setResetError(true);
        setResetMessage(body.error ?? "Unable to re-run reconciliation.");
        return;
      }
      await loadDashboard();
      setResetMessage(`Re-ran reconciliation for ${body.count} proof(s).`);
    } catch (error) {
      setResetError(true);
      setResetMessage(error instanceof Error ? error.message : "Unable to re-run reconciliation.");
    } finally {
      setRescanning(false);
    }
  }, [loadDashboard, smeConfig]);

  const value = useMemo<DashboardContextValue>(
    () => ({
      files,
      statuses,
      errors,
      notices,
      waiting,
      runs,
      completedRuns,
      rejectedRuns,
      hydrating,
      clearing,
      resetMessage,
      resetError,
      rescanning,
      loadDashboard,
      submitUpload,
      clearDemoData,
      rescan,
      setFilesFor,
      storedFor
    }),
    [
      files,
      statuses,
      errors,
      notices,
      waiting,
      runs,
      completedRuns,
      rejectedRuns,
      hydrating,
      clearing,
      resetMessage,
      resetError,
      rescanning,
      loadDashboard,
      submitUpload,
      clearDemoData,
      rescan,
      setFilesFor,
      storedFor
    ]
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within DashboardProvider.");
  }
  return context;
}
