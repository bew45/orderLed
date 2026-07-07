import React, { useEffect, useMemo, useState } from "react";
import { endpoints, firstScreenshotId, fmtMoney, SOURCE_APP_LABEL, STATUS_LABEL, type OrderRow } from "../api";
import { useAppData } from "../state/AppData";
import { Alert, Badge, BottomSheet, IconTrash, PrimaryButton } from "./ui";

const STATUS_OPTIONS = ["completed", "cancelled", "refunded", "unknown"];

export function OrderSheet(props: { orderId: string; onClose: () => void }) {
  const { orders, updateOrder, deleteOrder } = useAppData();
  const order = orders.find((o) => o.id === props.orderId);
  const [draft, setDraft] = useState<Partial<OrderRow>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const merged: OrderRow | undefined = order ? { ...order, ...draft } : undefined;
  const screenshotId = useMemo(() => (order ? firstScreenshotId(order) : null), [order]);

  useEffect(() => {
    if (!order) props.onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  if (!merged) return null;

  function patch(next: Partial<OrderRow>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updateOrder(merged!.id, {
        restaurant_name: merged!.restaurant_name,
        ordered_at: merged!.ordered_at,
        source_app: merged!.source_app,
        status: merged!.status,
        total_amount: Number(merged!.total_amount),
        refund_amount: Number(merged!.refund_amount),
        net_amount: Number(merged!.net_amount),
        items_text: merged!.items_text
      });
      props.onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await deleteOrder(merged!.id);
      props.onClose();
    } catch (err: any) {
      setError(err.message || "Failed to delete");
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      title={merged.restaurant_name || "Order"}
      subtitle={SOURCE_APP_LABEL[merged.source_app] ?? merged.source_app}
      onClose={props.onClose}
      footer={
        <>
          <PrimaryButton variant={confirmDelete ? "danger" : "ghost"} onClick={handleDelete} disabled={saving}>
            <IconTrash size={16} />
            {confirmDelete ? "Confirm delete" : "Delete"}
          </PrimaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>Save</PrimaryButton>
        </>
      }
    >
      <div className="stack">
        {error && <Alert variant="error" message={error} />}

        <div className="card-title-row">
          <Badge status={merged.review_state} />
          <span className="screen-subtitle">confidence {Math.round((merged.confidence || 0) * 100)}%</span>
        </div>

        {screenshotId && (
          <img className="thumb-preview" src={endpoints.screenshotImageUrl(screenshotId)} alt="Source screenshot" />
        )}

        <div className="field">
          <label>Restaurant</label>
          <input value={merged.restaurant_name} onChange={(e) => patch({ restaurant_name: e.target.value })} />
        </div>

        <div className="field">
          <label>Ordered at</label>
          <input
            type="datetime-local"
            value={merged.ordered_at?.slice(0, 16) ?? ""}
            onChange={(e) => patch({ ordered_at: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Status</label>
          <div className="segmented">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                className={merged.status === status ? "active" : ""}
                onClick={() => patch({ status })}
              >
                {STATUS_LABEL[status]}
              </button>
            ))}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Total</label>
            <input type="number" value={merged.total_amount} onChange={(e) => patch({ total_amount: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Refund</label>
            <input type="number" value={merged.refund_amount} onChange={(e) => patch({ refund_amount: Number(e.target.value) })} />
          </div>
        </div>

        <div className="field">
          <label>Net amount</label>
          <input type="number" value={merged.net_amount} onChange={(e) => patch({ net_amount: Number(e.target.value) })} />
          <span className="field-hint">Suggested: ฿{fmtMoney(Number(merged.total_amount) - Number(merged.refund_amount))}</span>
        </div>

        <div className="field">
          <label>Items</label>
          <textarea value={merged.items_text} onChange={(e) => patch({ items_text: e.target.value })} />
        </div>
      </div>
    </BottomSheet>
  );
}
