"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SmeToleranceConfig } from "../../lib/recon/reconciliation/policy";

const STORAGE_KEY = "reconpilot:sme-tolerance-config";

export const DEFAULT_SME_TOLERANCE_CONFIG: SmeToleranceConfig = {
  mode: "percentage",
  percentageValue: 0.02,
  fixedValue: "5.00"
};

type SmeSettingsContextValue = {
  config: SmeToleranceConfig;
  saveConfig: (config: SmeToleranceConfig) => void;
};

const SmeSettingsContext = createContext<SmeSettingsContextValue | null>(null);

function isValidConfig(value: unknown): value is SmeToleranceConfig {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SmeToleranceConfig>;
  return (
    (candidate.mode === "percentage" || candidate.mode === "fixed" || candidate.mode === "hybrid") &&
    typeof candidate.percentageValue === "number" &&
    Number.isFinite(candidate.percentageValue) &&
    candidate.percentageValue >= 0 &&
    candidate.percentageValue <= 1 &&
    typeof candidate.fixedValue === "string" &&
    /^\d+(?:\.\d{1,2})?$/.test(candidate.fixedValue.trim())
  );
}

export function SmeSettingsProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SmeToleranceConfig>(DEFAULT_SME_TOLERANCE_CONFIG);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (isValidConfig(parsed)) setConfig(parsed);
    } catch {
      // localStorage is optional; the enterprise default remains available.
    }
  }, []);

  const saveConfig = useCallback((nextConfig: SmeToleranceConfig) => {
    setConfig(nextConfig);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
    } catch {
      // Persistence failure should not block the current reconciliation request.
    }
  }, []);

  const value = useMemo<SmeSettingsContextValue>(() => ({ config, saveConfig }), [config, saveConfig]);

  return <SmeSettingsContext.Provider value={value}>{children}</SmeSettingsContext.Provider>;
}

export function useSmeSettings() {
  const context = useContext(SmeSettingsContext);
  if (!context) {
    throw new Error("useSmeSettings must be used within SmeSettingsProvider.");
  }
  return context;
}
