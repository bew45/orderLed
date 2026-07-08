import React, { useEffect, useMemo, useState } from "react";
import {
  endpoints,
  firstScreenshotId,
  fmtMoney,
  parseAmountCheck,
  STATUS_LABEL,
  type OrderRow,
  type ScreenshotRow
} from "../api";
import { useAppData } from "../state/AppData";
import { Alert, IconClose, IconEdit, IconPlus, IconTrash, PrimaryButton } from "./ui";

type Draft = {
  restaurant_name: string;
  total_amount: string;
  refund_amount: string;
  status: string;
  ordered_at: string;
  items_text: string;
};

type Page = {
  screenshot: ScreenshotRow;
  orders: OrderRow[];
};

const STATUS_OPTIONS = ["completed", "cancelled", "refunded", "unknown"];

function screenOrder(order: OrderRow) {
  try {
    const evidence = JSON.parse(order.evidence_json || "{}");
    const value = Number(evidence?.screenOrder);
    return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function orderToDraft(order: OrderRow): Draft {
  return {
    restaurant_name: order.restaurant_name,
    total_amount: String(order.total_amount ?? 0),
    refund_amount: String(order.refund_amount ?? 0),
    status: order.status,
    ordered_at: order.ordered_at,
    items_text: order.items_text
  };
}

function buildPages(orders: OrderRow[], screenshots: ScreenshotRow[], onlyNeedsCheck: boolean): Page[] {
  const byShot = new Map<string, OrderRow[]>();
  for (const order of orders) {
    if (onlyNeedsCheck && order.review_state !== "needs_check") continue;
    const shotId = firstScreenshotId(order);
    if (!shotId) continue;
    const list = byShot.get(shotId) ?? [];
    list.push(order);
    byShot.set(shotId, list);
  }
  return screenshots
    .filter((shot) => byShot.has(shot.id))
    .map((shot) => ({
      screenshot: shot,
      orders: (byShot.get(shot.id) || []).sort((a, b) => screenOrder(a) - screenOrder(b))
    }));
}

export function CheckFlow(props: { orders: OrderRow[]; screenshots: ScreenshotRow[]; onClose: () => void; focusScreenshotId?: string }) {
  const { createOrder, updateOrder, deleteOrder } = useAppData();
  const browseMode = Boolean(props.focusScreenshotId);
  const [pages, setPages] = useState<Page[]>(() => buildPages(props.orders, props.screenshots, !browseMode));
  const [pageIndex, setPageIndex] = useState(() => {
    if (!props.focusScreenshotId) return 0;
    const idx = pages.findIndex((p) => p.screenshot.id === props.focusScreenshotId);
    return idx >= 0 ? idx : 0;
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totalPages = pages.length;
  const page = pages[pageIndex];

  const amountCheck = useMemo(() => {
    if (!page) return null;
    return parseAmountCheck(page.screenshot.amount_check_json);
  }, [page]);

  useEffect(() => {
    if (page && page.orders.length === 0 && pageIndex < pages.length - 1) {
      setPageIndex((i) => i + 1);
    }
  }, [page, pageIndex, pages.length]);

  function resetRowState() {
    setEditingId(null);
    setAdding(false);
    setDraft(null);
    setConfirmDeleteId(null);
    setError("");
  }

  function goBack() {
    resetRowState();
    setPageIndex((i) => Math.max(0, i - 1));
  }

  function goNextPage() {
    resetRowState();
    setPageIndex((i) => Math.min(i + 1, pages.length));
  }

  function removeOrderFromCurrentPage(orderId: string) {
    setPages((current) =>
      current.map((p, i) => (i === pageIndex ? { ...p, orders: p.orders.filter((o) => o.id !== orderId) } : p))
    );
  }

  async function handleConfirmAll() {
    if (!page || page.orders.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await Promise.all(
        page.orders.map((order) =>
          updateOrder(order.id, {
            source_app: order.source_app,
            ordered_at: order.ordered_at,
            restaurant_name: order.restaurant_name,
            total_amount: order.total_amount,
            status: order.status,
            refund_amount: order.refund_amount,
            net_amount: order.net_amount,
            items_text: order.items_text
          })
        )
      );
      setPages((current) => current.map((p, i) => (i === pageIndex ? { ...p, orders: [] } : p)));
      resetRowState();
    } catch (err: any) {
      setError(err.message || "Failed to confirm orders");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(order: OrderRow) {
    setAdding(false);
    setEditingId(order.id);
    setDraft(orderToDraft(order));
    setConfirmDeleteId(null);
    setError("");
  }

  function startAdd() {
    if (!page) return;
    setAdding(true);
    setEditingId(null);
    setConfirmDeleteId(null);
    setError("");
    setDraft({
      restaurant_name: "",
      total_amount: "0",
      refund_amount: "0",
      status: "completed",
      ordered_at: page.orders[0]?.ordered_at || new Date().toISOString().slice(0, 19),
      items_text: ""
    });
  }

  async function saveNewRow() {
    if (!page || !draft) return;
    setBusy(true);
    setError("");
    try {
      const totalAmount = Number(draft.total_amount) || 0;
      const refundAmount = Number(draft.refund_amount) || 0;
      const created = await createOrder({
        batch_id: page.screenshot.batch_id,
        source_screenshot_id: page.screenshot.id,
        source_app: page.screenshot.source_app_guess || "unknown",
        restaurant_name: draft.restaurant_name || "Unknown restaurant",
        total_amount: totalAmount,
        refund_amount: refundAmount,
        net_amount: Math.max(0, totalAmount - refundAmount),
        status: draft.status,
        ordered_at: draft.ordered_at,
        items_text: draft.items_text
      });
      setPages((current) =>
        current.map((p, i) => (i === pageIndex ? { ...p, orders: [...p.orders, created].sort((a, b) => screenOrder(a) - screenOrder(b)) } : p))
      );
      resetRowState();
    } catch (err: any) {
      setError(err.message || "Failed to add order");
    } finally {
      setBusy(false);
    }
  }

  async function saveRow(order: OrderRow) {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const totalAmount = Number(draft.total_amount) || 0;
      const refundAmount = Number(draft.refund_amount) || 0;
      await updateOrder(order.id, {
        restaurant_name: draft.restaurant_name,
        total_amount: totalAmount,
        refund_amount: refundAmount,
        net_amount: Math.max(0, totalAmount - refundAmount),
        status: draft.status,
        ordered_at: draft.ordered_at,
        items_text: draft.items_text
      });
      removeOrderFromCurrentPage(order.id);
      resetRowState();
    } catch (err: any) {
      setError(err.message || "Failed to save order");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(order: OrderRow) {
    if (confirmDeleteId !== order.id) {
      setConfirmDeleteId(order.id);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await deleteOrder(order.id);
      removeOrderFromCurrentPage(order.id);
      resetRowState();
    } catch (err: any) {
      setError(err.message || "Failed to delete order");
    } finally {
      setBusy(false);
    }
  }

  const done = totalPages === 0 || pageIndex >= pages.length;

  if (done) {
    return (
      <div className="check-flow-overlay">
        <div className="check-flow-card">
          <div className="check-flow-head">
            <div>
              <p className="eyebrow">{browseMode ? "Edit screenshot" : "Check"}</p>
              <h2>{browseMode ? "Nothing to edit" : "All caught up"}</h2>
            </div>
            <button className="icon-btn" onClick={props.onClose} aria-label="Close">
              <IconClose size={18} />
            </button>
          </div>
          <div className="check-flow-empty">
            <p>
              {totalPages === 0
                ? browseMode
                  ? "This screenshot has no extracted rows to edit yet."
                  : "No screenshots need checking right now."
                : browseMode
                  ? "You've reached the end of this import's screenshots."
                  : "You've gone through every flagged screenshot."}
            </p>
          </div>
          <div className="check-flow-actions">
            <div className="btn-row">
              {totalPages > 0 && <PrimaryButton variant="ghost" onClick={goBack}>Back</PrimaryButton>}
              <PrimaryButton onClick={props.onClose}>Done</PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const screenshotId = page.screenshot.id;
  const screenshotUrl = endpoints.screenshotImageUrl(screenshotId);

  return (
    <div className="check-flow-overlay">
      <div className="check-flow-card">
        <div className="check-flow-head">
          <div className="check-flow-head-title">
            {pageIndex > 0 && (
              <button className="check-flow-back" onClick={goBack} disabled={busy}>Back</button>
            )}
            <div>
              <p className="eyebrow">{browseMode ? "Edit screenshot" : "Check"}</p>
              <h2>{pageIndex + 1} / {totalPages} - {page.orders.length} order{page.orders.length === 1 ? "" : "s"}</h2>
            </div>
          </div>
          <button className="icon-btn" onClick={props.onClose} aria-label="Close">
            <IconClose size={18} />
          </button>
        </div>

        <div className="check-flow-body">
          <div className="check-flow-image">
            <img src={screenshotUrl} alt={page.screenshot.original_name} />
            <button className="check-flow-image-label" type="button" onClick={() => setImageOpen(true)}>
              View image
            </button>
          </div>

          {amountCheck && amountCheck.state === "mismatch" && (
            <div className="check-flow-mismatch">
              <strong>Amount mismatch</strong>
              <span>AI THB {fmtMoney(amountCheck.sumAi)} / OCR THB {fmtMoney(amountCheck.sumScanner)}</span>
              {amountCheck.missingFromAi.length > 0 && (
                <small>Missing from AI: {amountCheck.missingFromAi.map((v) => `THB ${fmtMoney(v)}`).join(", ")}</small>
              )}
              {amountCheck.missingFromScanner.length > 0 && (
                <small>Missing from OCR: {amountCheck.missingFromScanner.map((v) => `THB ${fmtMoney(v)}`).join(", ")}</small>
              )}
            </div>
          )}

          {error && <Alert variant="error" message={error} />}

          <div className="check-row-list">
            {page.orders.map((order) => (
              <div className="check-row" key={order.id}>
                {editingId === order.id && draft ? (
                  <div className="check-row-edit">
                    <div className="field">
                      <label>Restaurant</label>
                      <input value={draft.restaurant_name} onChange={(e) => setDraft({ ...draft, restaurant_name: e.target.value })} />
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>Amount</label>
                        <input type="number" value={draft.total_amount} onChange={(e) => setDraft({ ...draft, total_amount: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Refund</label>
                        <input type="number" value={draft.refund_amount} onChange={(e) => setDraft({ ...draft, refund_amount: e.target.value })} />
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>Status</label>
                        <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>{STATUS_LABEL[option] ?? option}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Ordered at</label>
                        <input value={draft.ordered_at} onChange={(e) => setDraft({ ...draft, ordered_at: e.target.value })} />
                      </div>
                    </div>
                    <div className="field">
                      <label>Items</label>
                      <textarea value={draft.items_text} onChange={(e) => setDraft({ ...draft, items_text: e.target.value })} />
                    </div>
                    <div className="check-row-edit-actions">
                      <PrimaryButton variant="danger" disabled={busy} onClick={() => deleteRow(order)}>
                        <IconTrash size={14} /> {confirmDeleteId === order.id ? "Confirm delete" : "Delete order"}
                      </PrimaryButton>
                      <div className="btn-row">
                        <PrimaryButton variant="ghost" disabled={busy} onClick={resetRowState}>Cancel</PrimaryButton>
                        <PrimaryButton disabled={busy} onClick={() => saveRow(order)}>{busy ? "Saving..." : "Save"}</PrimaryButton>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <button className="check-row-main" onClick={() => startEdit(order)} aria-label={`Edit ${order.restaurant_name || "order"}`}>
                      <strong>{order.restaurant_name || "Unknown restaurant"}</strong>
                      <span className="tabular">THB {fmtMoney(order.total_amount)}</span>
                    </button>
                    <button
                      className="check-row-edit-btn"
                      disabled={busy}
                      onClick={() => startEdit(order)}
                      aria-label={`Edit ${order.restaurant_name || "order"}`}
                    >
                      <IconEdit size={15} />
                      <span>Edit</span>
                    </button>
                  </>
                )}
              </div>
            ))}
            {adding && draft && (
              <div className="check-row check-row--add">
                <div className="check-row-edit">
                  <div className="field">
                    <label>Restaurant</label>
                    <input value={draft.restaurant_name} onChange={(e) => setDraft({ ...draft, restaurant_name: e.target.value })} />
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>Amount</label>
                      <input type="number" value={draft.total_amount} onChange={(e) => setDraft({ ...draft, total_amount: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Refund</label>
                      <input type="number" value={draft.refund_amount} onChange={(e) => setDraft({ ...draft, refund_amount: e.target.value })} />
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>Status</label>
                      <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>{STATUS_LABEL[option] ?? option}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Ordered at</label>
                      <input value={draft.ordered_at} onChange={(e) => setDraft({ ...draft, ordered_at: e.target.value })} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Items</label>
                    <textarea value={draft.items_text} onChange={(e) => setDraft({ ...draft, items_text: e.target.value })} />
                  </div>
                  <div className="btn-row">
                    <PrimaryButton variant="ghost" disabled={busy} onClick={resetRowState}>Cancel</PrimaryButton>
                    <PrimaryButton disabled={busy} onClick={saveNewRow}>{busy ? "Adding..." : "Add order"}</PrimaryButton>
                  </div>
                </div>
              </div>
            )}
            {!adding && (
              <button className="check-add-order-btn" type="button" disabled={busy} onClick={startAdd}>
                <IconPlus size={16} />
                <span>Add order</span>
              </button>
            )}
          </div>
        </div>

        <div className="check-flow-actions">
          <div className="check-flow-actions-secondary">
            <button className="check-flow-text-btn" disabled={busy} onClick={goNextPage}>Skip this page</button>
          </div>
          <PrimaryButton block disabled={busy || page.orders.length === 0} onClick={handleConfirmAll}>
            {busy ? "Saving..." : `Confirm all ${page.orders.length} correct`}
          </PrimaryButton>
        </div>
      </div>
      {imageOpen && (
        <div className="check-image-viewer" role="dialog" aria-modal="true" aria-label="Screenshot preview">
          <div className="check-image-viewer-head">
            <span>{page.screenshot.original_name}</span>
            <button className="icon-btn" onClick={() => setImageOpen(false)} aria-label="Close image">
              <IconClose size={18} />
            </button>
          </div>
          <div className="check-image-viewer-body">
            <img src={screenshotUrl} alt={page.screenshot.original_name} />
          </div>
        </div>
      )}
    </div>
  );
}
