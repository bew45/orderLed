import React, { useState } from "react";
import { fmtMoney } from "../api";
import { useAppData } from "../state/AppData";
import { EmptyState, IconHistory, IconPlus, IconTrash, PrimaryButton } from "../components/ui";

export function BatchesScreen(props: { onCreateBatch: () => void; onSelected: () => void }) {
  const { batches, activeBatchId, selectBatch, deleteBatch } = useAppData();
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
                  {batch.id === activeBatchId ? "Active" : "Make active"}
                </PrimaryButton>
                <PrimaryButton className="btn-sm" variant={confirmId === batch.id ? "danger" : "ghost"} onClick={() => handleDelete(batch.id)}>
                  <IconTrash size={14} /> {confirmId === batch.id ? "Confirm" : "Delete"}
                </PrimaryButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
