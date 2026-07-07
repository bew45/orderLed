import React, { useMemo, useState } from "react";
import { endpoints, fmtMoney, fmtMonthLabel, type OrderRow } from "../api";
import { useAppData } from "../state/AppData";
import { Alert, EmptyState, IconExport, PrimaryButton } from "../components/ui";

function orderAmount(order: Pick<OrderRow, "net_amount" | "total_amount">) {
  return Number(order.net_amount || order.total_amount || 0);
}

function orderMonth(order: Pick<OrderRow, "ordered_at">) {
  return /^\d{4}-\d{2}/.test(order.ordered_at || "") ? order.ordered_at.slice(0, 7) : "unknown";
}

function monthLabel(month: string) {
  return month === "unknown" ? "Unknown month" : fmtMonthLabel(month);
}

export function ExportScreen() {
  const { activeBatch, orders } = useAppData();
  const [selectedMonth, setSelectedMonth] = useState("all");

  const exportState = useMemo(() => {
    const months = [...new Set(orders.map(orderMonth))].sort();
    const filtered = selectedMonth === "all" ? orders : orders.filter((order) => orderMonth(order) === selectedMonth);
    const netSpend = filtered.reduce((sum, order) => sum + orderAmount(order), 0);
    const needsCheck = filtered.filter((order) => order.review_state === "needs_review").length;
    return { months, filtered, netSpend, needsCheck };
  }, [orders, selectedMonth]);

  if (!activeBatch) {
    return (
      <div className="screen">
        <EmptyState icon={<IconExport size={24} />} title="Nothing to export yet" body="Create an import and process screenshots first." />
      </div>
    );
  }

  const monthParam = selectedMonth === "all" ? undefined : selectedMonth;
  const exportLabel = selectedMonth === "all" ? "Full import" : monthLabel(selectedMonth);

  return (
    <div className="screen">
      <div>
        <p className="eyebrow">Export</p>
        <h2 className="screen-title">{activeBatch.title}</h2>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Selection</span>
          <strong className="stat-value tabular">{exportState.filtered.length}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Net spend</span>
          <strong className="stat-value tabular">THB {fmtMoney(exportState.netSpend)}</strong>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="dashboard-section-head">
          <h3>Export range</h3>
          <span>{exportLabel}</span>
        </div>
        <div className="month-chip-row">
          <button className={selectedMonth === "all" ? "chip active" : "chip"} onClick={() => setSelectedMonth("all")}>All</button>
          {exportState.months.map((month) => (
            <button key={month} className={selectedMonth === month ? "chip active" : "chip"} onClick={() => setSelectedMonth(month)}>
              {monthLabel(month)}
            </button>
          ))}
        </div>
      </div>

      {exportState.needsCheck > 0 && (
        <Alert
          variant="warning"
          title={`${exportState.needsCheck} row${exportState.needsCheck === 1 ? "" : "s"} may need checking`}
          message="You can export now. These rows are low-confidence, cancelled, or refunded cases, so totals may change if corrected later."
        />
      )}

      <div className="card stack">
        <PrimaryButton block onClick={() => window.open(endpoints.exportUrl(activeBatch.id, "xls", monthParam), "_blank")}>
          Export Excel (.xls)
        </PrimaryButton>
        <PrimaryButton block variant="ghost" onClick={() => window.open(endpoints.exportUrl(activeBatch.id, "csv", monthParam), "_blank")}>
          Export CSV
        </PrimaryButton>
        <PrimaryButton block variant="ghost" onClick={() => window.open(endpoints.exportUrl(activeBatch.id, "pdf", monthParam), "_blank")}>
          Export PDF
        </PrimaryButton>
        <span className="export-filename">orderledger-{selectedMonth === "all" ? "all" : selectedMonth}.xls / .csv / .pdf</span>
      </div>
    </div>
  );
}
