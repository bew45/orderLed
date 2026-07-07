import React, { useState } from "react";
import { endpoints, fmtMoney } from "../api";
import { useAppData } from "../state/AppData";
import { EmptyState, IconHistory, IconPlus, IconTrash, PrimaryButton } from "../components/ui";

export function BatchesScreen(props: { onCreateBatch: () => void }) {
  const { batches, activeBatchId, screenshots, selectBatch, deleteBatch } = useAppData();
  const [confirmId, setConfirmId] = useState("");

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
                  <span className="badge badge--needs_review">{batch.summary.ordersNeedingReview} check</span>
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
                  onClick={() => selectBatch(batch.id)}
                >
                  {batch.id === activeBatchId ? "Active" : "Make active"}
                </PrimaryButton>
                <PrimaryButton className="btn-sm" variant={confirmId === batch.id ? "danger" : "ghost"} onClick={() => handleDelete(batch.id)}>
                  <IconTrash size={14} /> {confirmId === batch.id ? "Confirm" : "Delete"}
                </PrimaryButton>
              </div>
              {batch.id === activeBatchId && batch.summary.screenshotsTotal > 0 && (
                <BatchScreenshotList
                  expectedCount={batch.summary.screenshotsTotal}
                  screenshots={screenshots.filter((shot) => shot.batch_id === batch.id)}
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
  screenshots: Array<{ id: string; original_name: string; width: number; height: number; processed_at: number; error: string }>;
}) {
  if (props.screenshots.length === 0) {
    return <div className="batch-image-loading">Loading {props.expectedCount} uploaded image{props.expectedCount === 1 ? "" : "s"}...</div>;
  }

  return (
    <div className="uploaded-shot-list">
      {props.screenshots.slice(0, 12).map((shot) => (
        <a className="uploaded-shot" key={shot.id} href={endpoints.screenshotImageUrl(shot.id)} target="_blank" rel="noreferrer">
          <span className="uploaded-shot-thumb">
            <img src={endpoints.screenshotImageUrl(shot.id)} alt={shot.original_name} loading="lazy" />
          </span>
          <span className="uploaded-shot-info">
            <strong>{shot.original_name}</strong>
            <small>{shot.width || 0} x {shot.height || 0} / {shot.error ? "Failed" : shot.processed_at > 0 ? "Read" : "Uploaded"}</small>
          </span>
          <span className={shot.error ? "uploaded-shot-status is-failed" : "uploaded-shot-status"}>
            {shot.error ? "Failed" : shot.processed_at > 0 ? "Read" : "Open"}
          </span>
        </a>
      ))}
    </div>
  );
}
