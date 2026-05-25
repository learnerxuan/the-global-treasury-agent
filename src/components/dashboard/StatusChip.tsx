import { statusMeta } from "./adapter";
import type { RunStatus } from "./types";

export function StatusChip({ status }: { status: RunStatus }) {
  const meta = statusMeta(status);
  return <span className={`chip ${meta.tone}`}>{meta.label}</span>;
}
