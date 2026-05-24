"use client";

import { ReconciliationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, AlertTriangle, XCircle } from "lucide-react";

interface StatusBadgeProps {
  status: ReconciliationStatus;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

const statusConfig = {
  AUTO_MATCHED: {
    label: "Auto Matched",
    icon: CheckCircle2,
    className: "bg-status-auto-matched/15 text-status-auto-matched border-status-auto-matched/30",
  },
  LIKELY_MATCHED: {
    label: "Likely Matched",
    icon: Circle,
    className: "bg-status-likely-matched/15 text-status-likely-matched border-status-likely-matched/30",
  },
  NEEDS_REVIEW: {
    label: "Needs Review",
    icon: AlertTriangle,
    className: "bg-status-needs-review/15 text-status-needs-review border-status-needs-review/30",
  },
  UNMATCHED: {
    label: "Unmatched",
    icon: XCircle,
    className: "bg-status-unmatched/15 text-status-unmatched border-status-unmatched/30",
  },
};

const sizeClasses = {
  sm: "text-xs px-2 py-0.5 gap-1",
  md: "text-sm px-2.5 py-1 gap-1.5",
  lg: "text-base px-3 py-1.5 gap-2",
};

const iconSizes = {
  sm: 12,
  md: 14,
  lg: 16,
};

export function StatusBadge({ status, showIcon = true, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border",
        config.className,
        sizeClasses[size]
      )}
    >
      {showIcon && <Icon size={iconSizes[size]} />}
      {config.label}
    </span>
  );
}

export function StatusDot({ status, size = 8 }: { status: ReconciliationStatus; size?: number }) {
  const colorClass = {
    AUTO_MATCHED: "bg-status-auto-matched",
    LIKELY_MATCHED: "bg-status-likely-matched",
    NEEDS_REVIEW: "bg-status-needs-review",
    UNMATCHED: "bg-status-unmatched",
  }[status];

  return (
    <span
      className={cn("rounded-full inline-block", colorClass)}
      style={{ width: size, height: size }}
    />
  );
}
