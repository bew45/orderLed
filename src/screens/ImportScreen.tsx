import React, { useMemo, useState } from "react";
import { fmtMonthLabel, SOURCE_APP_LABEL, type OrderRow } from "../api";
import { ScreenshotList } from "../components/ScreenshotList";
import { EmptyState, IconCamera, IconChart, IconInbox, PrimaryButton } from "../components/ui";
import { useAppData } from "../state/AppData";

type StageState = "waiting" | "active" | "done" | "failed";

function orderAmount(order: Pick<OrderRow, "net_amount" | "total_amount">) {
  return Number(order.net_amount || order.total_amount || 0);
}

function orderMonth(order: Pick<OrderRow, "ordered_at">) {
  return /^\d{4}-\d{2}/.test(order.ordered_at || "") ? order.ordered_at.slice(0, 7) : "unknown";
}

function monthLabel(month: string) {
  return month === "unknown" ? "Unknown" : fmtMonthLabel(month);
}

function countBy<T>(items: T[], pick: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = pick(item) || "unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function ImportScreen(props: { onUpload: () => void; onCreateBatch: () => void; onOpenDashboard: () => void }) {
  const { activeBatch, summary, screenshots, orders, deleteScreenshot, processActiveBatch } = useAppData();
  const [processing, setProcessing] = useState(false);

  async function handleProcess(force: boolean) {
    setProcessing(true);
    try {
      await processActiveBatch(force);
    } finally {
      setProcessing(false);
    }
  }

  const importStats = useMemo(() => {
    const months = countBy(orders, orderMonth);
    const appRows = orders.length > 0
      ? countBy(orders, (order) => order.source_app)
      : countBy(screenshots, (shot) => shot.source_app_guess);
    const ocrLines = screenshots.reduce((sum, shot) => sum + Number(shot.ocr_line_count || 0), 0);
    const rowsFromShots = screenshots.reduce((sum, shot) => sum + Number(shot.extracted_order_count || 0), 0);
    const netSpend = orders.reduce((sum, order) => sum + orderAmount(order), 0);

    return {
      months,
      appRows,
      ocrLines,
      rowsFromShots,
      netSpend
    };
  }, [orders, screenshots]);

  if (!activeBatch) {
    return (
      <div className="screen">
        <EmptyState
          icon={<IconInbox size={24} />}
          title="Start an import"
          body="Create an import session before uploading screenshots."
        >
          <PrimaryButton onClick={props.onCreateBatch}>Create import</PrimaryButton>
        </EmptyState>
      </div>
    );
  }

  const total = summary?.screenshotsTotal ?? screenshots.length;
  const failed = summary?.screenshotsFailed ?? screenshots.filter((shot) => shot.error).length;
  const processed = summary?.screenshotsProcessed ?? screenshots.filter((shot) => shot.processed_at > 0).length;
  const ordersFound = summary?.ordersTotal ?? orders.length;
  const unread = screenshots.filter((shot) => !shot.processed_at && !shot.error).length;
  const canReadNew = total > 0 && !processing && (unread > 0 || failed > 0);
  const canReread = total > 0 && !processing && (processed > 0 || failed > 0 || ordersFound > 0);
  const stages: Array<{ label: string; meta: string; state: StageState }> = [
    { label: "Upload", meta: `${total} file${total === 1 ? "" : "s"}`, state: total > 0 ? "done" : "active" },
    {
      label: "Read OCR",
      meta: total > 0 ? `${processed}/${total} read` : "waiting for files",
      state: processing ? "active" : failed > 0 ? "failed" : processed > 0 ? "done" : total > 0 ? "active" : "waiting"
    },
    {
      label: "Extract rows",
      meta: `${ordersFound} row${ordersFound === 1 ? "" : "s"}`,
      state: ordersFound > 0 ? "done" : processed > 0 || failed > 0 ? "active" : "waiting"
    },
    {
      label: "Dashboard",
      meta: ordersFound > 0 ? "ready" : "not ready",
      state: ordersFound > 0 ? "done" : "waiting"
    }
  ];

  return (
    <div className="screen">
      <div>
        <p className="eyebrow">Import Workspace</p>
        <h2 className="screen-title">{activeBatch.title}</h2>
        <p className="screen-subtitle">Upload screenshots, read them, inspect OCR text, then send the batch to Dashboard.</p>
      </div>

      <section className="import-pipeline-card">
        <div className="import-pipeline-head">
          <div>
            <h3>Batch pipeline</h3>
            <p>{ordersFound > 0 ? "This batch has extracted rows and can be opened in Dashboard." : total > 0 ? "Files are ready. Run Read to extract rows." : "Start by uploading iPhone screenshots."}</p>
          </div>
          <PrimaryButton className="btn-sm" onClick={props.onUpload}>
            <IconCamera size={15} /> Upload
          </PrimaryButton>
        </div>
        <div className="import-stage-list">
          {stages.map((stage, index) => (
            <div className={`import-stage is-${stage.state}`} key={stage.label}>
              <span className="import-stage-index tabular">{index + 1}</span>
              <span className="import-stage-main">
                <strong>{stage.label}</strong>
                <small>{stage.meta}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="btn-row import-action-row">
        <PrimaryButton disabled={!canReadNew} onClick={() => handleProcess(false)}>
          {processing ? "Reading..." : failed > 0 && unread === 0 ? "Retry failed" : unread > 0 ? `Read ${unread} new` : "Read screenshots"}
        </PrimaryButton>
        <PrimaryButton variant="ghost" disabled={!canReread} onClick={() => handleProcess(true)}>
          Re-read all
        </PrimaryButton>
      </div>

      {ordersFound > 0 && (
        <PrimaryButton block onClick={props.onOpenDashboard}>
          <IconChart size={16} /> Open Dashboard
        </PrimaryButton>
      )}

      {ordersFound > 0 && (
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h3>Batch summary</h3>
            <span>{ordersFound} rows</span>
          </div>
          <div className="import-summary-lines">
            <div className="import-summary-line">
              <span>Detected months</span>
              <strong>{importStats.months.map(([month]) => monthLabel(month)).join(", ")}</strong>
            </div>
            <div className="import-summary-line">
              <span>Apps</span>
              <strong>{importStats.appRows.map(([app, count]) => `${SOURCE_APP_LABEL[app] ?? app} ${count}`).join(" / ")}</strong>
            </div>
            <div className="import-summary-line">
              <span>Net amount</span>
              <strong className="tabular">THB {importStats.netSpend.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
          </div>
        </section>
      )}

      {screenshots.length === 0 ? (
        <EmptyState
          icon={<IconCamera size={22} />}
          title="No screenshots in this import"
          body="Upload screenshots first. They will stay in this workspace after reload."
        >
          <PrimaryButton onClick={props.onUpload}>Upload screenshots</PrimaryButton>
        </EmptyState>
      ) : (
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h3>Uploaded files and OCR</h3>
            <span>{screenshots.length} image{screenshots.length === 1 ? "" : "s"}</span>
          </div>
          <ScreenshotList screenshots={screenshots} onDelete={deleteScreenshot} showOcr />
        </section>
      )}
    </div>
  );
}
