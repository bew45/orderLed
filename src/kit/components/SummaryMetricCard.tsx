import React from "react";

export interface SummaryMetricCardProps {
  /** e.g. "Net Spend", "Completed Spend", "Orders", "Needs Review" */
  label: string;
  /** Pre-formatted headline value, e.g. "฿12,480.50" or "128" */
  value: string;
  /** Optional short unit/suffix rendered smaller next to the value, e.g. "orders" */
  unit?: string;
  /** Optional trend line under the value, e.g. "+8.2% vs last month" */
  deltaLabel?: string;
  deltaDirection?: "up" | "down" | "flat";
  /** Ledger-tab accent color, any CSS color or var(). Defaults to brand green. */
  accentColor?: string;
  icon?: React.ReactNode;
}

/**
 * A single-metric summary card — Net Spend, Completed Spend, Orders,
 * Needs Review, etc. Designed to sit in a 2-column grid on mobile.
 */
export function SummaryMetricCard({
  label,
  value,
  unit,
  deltaLabel,
  deltaDirection = "flat",
  accentColor = "var(--ol-brand)",
  icon,
}: SummaryMetricCardProps) {
  const deltaGlyph =
    deltaDirection === "up" ? "▲" : deltaDirection === "down" ? "▼" : "•";

  return (
    <div className="ol-metric-card">
      <span className="ol-metric-card__tab" style={{ background: accentColor }} />
      <div className="ol-metric-card__head">
        <span className="ol-metric-card__label">{label}</span>
        {icon}
      </div>
      <div>
        <span className="ol-metric-card__value ol-tabular">{value}</span>
        {unit && <span className="ol-metric-card__unit">{unit}</span>}
      </div>
      {deltaLabel && (
        <div className="ol-metric-card__foot">
          <span className={`ol-metric-card__delta ol-metric-card__delta--${deltaDirection}`}>
            {deltaGlyph} {deltaLabel}
          </span>
        </div>
      )}
    </div>
  );
}

export default SummaryMetricCard;

/* ---------------------------------------------------------------------------
 * Example usage (2-up mobile grid):
 *
 * <div className="ol-metric-grid">
 *   <SummaryMetricCard
 *     label="Net Spend"
 *     value="฿12,480.50"
 *     deltaLabel="+8.2% vs last month"
 *     deltaDirection="up"
 *     accentColor="var(--ol-brand)"
 *   />
 *   <SummaryMetricCard
 *     label="Completed Spend"
 *     value="฿10,960.00"
 *     deltaLabel="93 orders"
 *     deltaDirection="flat"
 *     accentColor="var(--ol-green)"
 *   />
 *   <SummaryMetricCard
 *     label="Orders"
 *     value="128"
 *     unit="total"
 *     accentColor="var(--ol-blue)"
 *   />
 *   <SummaryMetricCard
 *     label="Needs Review"
 *     value="6"
 *     deltaLabel="clear before export"
 *     deltaDirection="down"
 *     accentColor="var(--ol-amber)"
 *   />
 * </div>
 * ------------------------------------------------------------------------- */
