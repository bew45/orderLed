import React, { useState } from "react";
import { endpoints, fmtMoney, type ScreenshotRow } from "../api";
import { ScreenshotList } from "../components/ScreenshotList";
import { useAppData } from "../state/AppData";
import { Alert, EmptyState, IconExport, IconHistory, IconPlus, IconTrash, PrimaryButton } from "../components/ui";

async function fetchPdfBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to generate PDF (${res.status})`);
  return res.blob();
}

async function sharePdf(url: string, filename: string) {
  const blob = await fetchPdfBlob(url);
  const file = new File([blob], filename, { type: "application/pdf" });
  // iPhone / Android — opens native share sheet (Save to Files, AirDrop, LINE, etc.)
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    await navigator.share({ title: "OrderLedger Invoice", files: [file] });
    return;
  }
  // Desktop fallback — trigger a download
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function BatchesScreen(props: { onCreateBatch: () => void; onSelected: () => void }) {
  const { batches, activeBatchId, screenshots, selectBatch, deleteBatch, deleteScreenshot } = useAppData();
  const [confirmId, setConfirmId] = useState("");
  const [exportingId, setExportingId] = useState("");
  const [errorId, setErrorId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleDelete(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    await deleteBatch(id);
    setConfirmId("");
  }

  return (
    <div className="screen">
      <div className="review-filter-row">
        <h2 className="screen-title">History</h2>
        <PrimaryButton className="btn-sm" onClick={props.onCreateBatch}>
          <IconPlus size={16} /> New import
        </PrimaryButton>
      </div>

      {batches.length === 0 ? (
        <EmptyState icon={<IconHistory size={24} />} title="No imports yet" body="Create your first import to start reading screenshots." />
      ) : (
        <div className="stack">
          {batches.map((batch) => (
            <div key={batch.id} className={batch.id === activeBatchId ? "batch-card active" : "batch-card"}>
              <div className="batch-title-row">
                <strong>{batch.title}</strong>
                {batch.summary.ordersNeedingReview > 0 && (
                  <span className="badge badge--needs_check">{batch.summary.ordersNeedingReview} check</span>
                )}
              </div>
              <div className="batch-meta">
                <span>{batch.summary.screenshotsTotal} images</span>
                <span>/</span>
                <span>{batch.summary.ordersTotal} orders</span>
                <span>/</span>
                <span>THB {fmtMoney(batch.summary.netSpend)}</span>
              </div>
              <div className="chip-row">
                <PrimaryButton
                  className="btn-sm"
                  variant={batch.id === activeBatchId ? "primary" : "ghost"}
                  onClick={() => { selectBatch(batch.id); props.onSelected(); }}
                >
                  {batch.id === activeBatchId ? "Open import" : "Select"}
                </PrimaryButton>
                <PrimaryButton
                  className="btn-sm"
                  variant="ghost"
                  disabled={exportingId === batch.id}
                  onClick={async () => {
                    setExportingId(batch.id);
                    setErrorId("");
                    setErrorMsg("");
                    try {
                      const pdfUrl = endpoints.exportUrl(batch.id, "pdf");
                      const pdfFilename = `orderledger-invoice-${batch.id}.pdf`;
                      await sharePdf(pdfUrl, pdfFilename);
                    } catch (err: any) {
                      if (err?.name !== "AbortError") {
                        setErrorId(batch.id);
                        setErrorMsg(err?.message || "Failed to export PDF");
                      }
                    } finally {
                      setExportingId("");
                    }
                  }}
                >
                  <IconExport size={14} /> {exportingId === batch.id ? "Exporting…" : "Export PDF"}
                </PrimaryButton>
                <PrimaryButton className="btn-sm" variant={confirmId === batch.id ? "danger" : "ghost"} onClick={() => handleDelete(batch.id)}>
                  <IconTrash size={14} /> {confirmId === batch.id ? "Confirm" : "Delete"}
                </PrimaryButton>
              </div>
              {errorId === batch.id && (
                <div style={{ marginTop: "0.5rem" }}>
                  <Alert variant="error" title="PDF error" message={errorMsg} onDismiss={() => setErrorId("")} />
                </div>
              )}
              {batch.id === activeBatchId && batch.summary.screenshotsTotal > 0 && (
                <BatchScreenshotList
                  expectedCount={batch.summary.screenshotsTotal}
                  screenshots={screenshots.filter((shot) => shot.batch_id === batch.id)}
                  onDelete={deleteScreenshot}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchScreenshotList(props: {
  expectedCount: number;
  screenshots: ScreenshotRow[];
  onDelete: (id: string) => Promise<void>;
}) {
  if (props.screenshots.length === 0) {
    return <div className="batch-image-loading">Loading {props.expectedCount} uploaded image{props.expectedCount === 1 ? "" : "s"}...</div>;
  }

  return (
    <ScreenshotList screenshots={props.screenshots} onDelete={props.onDelete} limit={12} />
  );
}
