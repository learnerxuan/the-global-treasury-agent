"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import type { SmeToleranceConfig, SmeToleranceMode } from "../../lib/recon/reconciliation/policy";
import { useSmeSettings } from "./SmeSettingsContext";

const MODES: Array<{ value: SmeToleranceMode; label: string }> = [
  { value: "percentage", label: "Percentage" },
  { value: "fixed", label: "Fixed" },
  { value: "hybrid", label: "Hybrid" }
];

function normalizeFixedValue(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return "0.00";
  return parsed.toFixed(2);
}

export function ReconciliationSettingsPanel() {
  const { config, saveConfig } = useSmeSettings();
  const [mode, setMode] = useState<SmeToleranceMode>(config.mode);
  const [percentage, setPercentage] = useState(String(config.percentageValue * 100));
  const [fixedValue, setFixedValue] = useState(config.fixedValue);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMode(config.mode);
    setPercentage(String(config.percentageValue * 100));
    setFixedValue(config.fixedValue);
  }, [config]);

  const percentageNumber = Number(percentage);
  const percentageFraction = Number.isFinite(percentageNumber) ? Math.max(0, Math.min(100, percentageNumber)) / 100 : 0;
  const isHighTolerance = percentageFraction > 0.05 || Number(fixedValue) > 500;
  const effectiveSummary = useMemo(() => {
    if (mode === "percentage") return `${percentageNumber || 0}%`;
    if (mode === "fixed") return `${normalizeFixedValue(fixedValue)} local`;
    return `greater of ${percentageNumber || 0}% or ${normalizeFixedValue(fixedValue)} local`;
  }, [fixedValue, mode, percentageNumber]);

  function handleModeChange(event: ChangeEvent<HTMLInputElement>) {
    setMode(event.target.value as SmeToleranceMode);
    setSaved(false);
  }

  function handleSave() {
    const nextConfig: SmeToleranceConfig = {
      mode,
      percentageValue: percentageFraction,
      fixedValue: normalizeFixedValue(fixedValue)
    };
    saveConfig(nextConfig);
    setSaved(true);
  }

  return (
    <section className="settings-panel" aria-label="Reconciliation tolerance settings">
      <div className="settings-head">
        <div>
          <p style={{ color: "rgba(245, 248, 242, 0.52)", fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>Tolerance policy</p>
          <h2>Auto-match tolerance limit</h2>
        </div>
        <span className="settings-summary">{effectiveSummary}</span>
      </div>

      <div className="settings-grid">
        <fieldset className="settings-modes">
          <legend>Mode</legend>
          {MODES.map((item) => (
            <label className={`mode-option ${mode === item.value ? "active" : ""}`} key={item.value}>
              <input type="radio" name="sme-tolerance-mode" value={item.value} checked={mode === item.value} onChange={handleModeChange} />
              <span>{item.label}</span>
            </label>
          ))}
        </fieldset>

        <label className="settings-field">
          <span>Percentage</span>
          <div className="input-unit">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={percentage}
              onChange={(event) => {
                setPercentage(event.target.value);
                setSaved(false);
              }}
            />
            <span>%</span>
          </div>
        </label>

        <label className="settings-field">
          <span>Fixed amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={fixedValue}
            onChange={(event) => {
              setFixedValue(event.target.value);
              setSaved(false);
            }}
          />
        </label>

        <div className="settings-actions">
          <button className="secondary-button" type="button" onClick={handleSave}>
            Save settings
          </button>
          {saved ? <span className="settings-saved">Saved</span> : null}
        </div>
      </div>

      {isHighTolerance ? (
        <p className="settings-warning">
          High tolerances can auto-match incorrect payments or hide large fees. Review the next reconciliation run carefully.
        </p>
      ) : null}
    </section>
  );
}
