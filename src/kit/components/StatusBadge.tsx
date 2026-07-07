import React from "react";
import { OrderStatus, STATUS_LABEL } from "./types";

export interface StatusBadgeProps {
  status: OrderStatus;
  /** Override the default label, e.g. for localized Thai copy. */
  label?: string;
  className?: string;
}

/**
 * Reusable status badge for order rows, filters, and legends.
 * Color coding follows the kit's "correction pen" palette:
 * green = completed, red = cancelled, plum = refunded,
 * gray = unknown, amber = needs review, blue = corrected.
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span className={`ol-badge ol-badge--${status} ${className ?? ""}`}>
      <span className="ol-badge__dot" />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export default StatusBadge;

/* ---------------------------------------------------------------------------
 * Example usage:
 *
 * <StatusBadge status="needs_review" />
 * <StatusBadge status="completed" label="สำเร็จ" />
 * ------------------------------------------------------------------------- */
