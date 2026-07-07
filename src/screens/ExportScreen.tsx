import React from "react";
import { endpoints, fmtMoney, fmtMonthLabel } from "../api";
import { useAppData } from "../state/AppData";
import { EmptyState } from "../kit/components/EmptyState";
import { ExportActionPanel } from "../kit/components/ExportActionPanel";
import { SummaryMetricCard } from "../kit/components/SummaryMetricCard";

export function ExportScreen() {
  const { activeBatch, summary } = useAppData();

  if (!activeBatch) {
    return (
      <div className="screen">
        <EmptyState kind="no_orders" title="Nothing to export yet" description="Create a batch and process screenshots first." />
      </div>
    );
  }

  const needsReview = summary?.ordersNeedingReview ?? 0;
  const openExport = (kind: "xls" | "csv" | "pdf") => window.open(endpoints.exportUrl(activeBatch.id, kind), "_blank");

  return (
    <div className="screen">
      <div>
        <p className="ol-eyebrow">{fmtMonthLabel(activeBatch.month)}</p>
        <h2 className="screen-title">{activeBatch.title}</h2>
      </div>

      <div className="ol-metric-grid">
        <SummaryMetricCard label="Net spend" value={`฿${fmtMoney(summary?.netSpend ?? 0)}`} accentColor="var(--ol-brand)" />
        <SummaryMetricCard label="Orders" value={String(summary?.ordersTotal ?? 0)} unit="rows" accentColor="var(--ol-blue)" />
      </div>

      <ExportActionPanel
        needsReviewCount={needsReview}
        disabled={!summary?.ordersTotal}
        onExportExcel={() => openExport("xls")}
        onExportCsv={() => openExport("csv")}
        onExportPdf={() => openExport("pdf")}
      />

      <span className="export-filename">orderledger-{activeBatch.month}.xls / .csv / .pdf</span>
    </div>
  );
}
