import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type BatchSummary = {
  batchId: string;
  screenshotsTotal: number;
  screenshotsProcessed: number;
  screenshotsFailed: number;
  ordersTotal: number;
  ordersNeedingReview: number;
  netSpend: number;
  completedSpend: number;
  refundedOrCancelled: number;
};

type BatchListItem = {
  id: string;
  title: string;
  month: string;
  summary: BatchSummary;
};

type OrderRow = {
  id: string;
  source_app: string;
  ordered_at: string;
  restaurant_name: string;
  total_amount: number;
  status: string;
  refund_amount: number;
  net_amount: number;
  items_text: string;
  confidence: number;
  review_state: string;
  evidence_json: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...(init?.headers || {}) }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return await res.json() as T;
}

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function fmt(value: number) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

function App() {
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [activeId, setActiveId] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [title, setTitle] = useState(`Food orders ${monthNow()}`);
  const [month, setMonth] = useState(monthNow());
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const activeBatch = useMemo(() => batches.find((batch) => batch.id === activeId), [batches, activeId]);
  const reviewCount = orders.filter((order) => order.review_state === "needs_review").length;

  async function refresh() {
    const data = await api<{ batches: BatchListItem[] }>("/api/batches");
    setBatches(data.batches);
    if (!activeId && data.batches[0]) setActiveId(data.batches[0].id);
  }

  async function loadBatch(id: string) {
    if (!id) return;
    const data = await api<{ orders: OrderRow[]; summary: BatchSummary }>(`/api/batches/${id}/orders`);
    setOrders(data.orders);
    setSummary(data.summary);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadBatch(activeId).catch((err) => setError(err.message));
  }, [activeId]);

  async function create() {
    setBusy("Creating batch...");
    setError("");
    try {
      const data = await api<{ batch: BatchListItem }>("/api/batches", {
        method: "POST",
        body: JSON.stringify({ title, month })
      });
      await refresh();
      setActiveId(data.batch.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function upload() {
    if (!activeId || !files?.length) return;
    setBusy("Uploading screenshots...");
    setError("");
    try {
      const form = new FormData();
      [...files].forEach((file) => form.append("files", file));
      await api(`/api/batches/${activeId}/screenshots`, { method: "POST", body: form });
      await refresh();
      await loadBatch(activeId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function process(force = false) {
    if (!activeId) return;
    setBusy("Reading screenshots...");
    setError("");
    try {
      const data = await api<{ summary: BatchSummary }>(`/api/batches/${activeId}/process`, {
        method: "POST",
        body: JSON.stringify({ force })
      });
      setSummary(data.summary);
      await refresh();
      await loadBatch(activeId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function updateOrder(id: string, patch: Partial<OrderRow>) {
    const data = await api<{ order: OrderRow }>(`/api/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    setOrders((current) => current.map((order) => order.id === id ? data.order : order));
  }

  function exportUrl(kind: "xls" | "csv" | "pdf") {
    return activeId ? `/api/batches/${activeId}/export.${kind}` : "#";
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">local food spending ledger</p>
          <h1>OrderLedger</h1>
          <p className="subtitle">Upload delivery history screenshots, extract order rows, review weak reads, and export clean reports.</p>
        </div>
        <div className="hero-actions">
          <a className="export-button" href={exportUrl("xls")}>Export Excel</a>
          <a className="ghost-button" href={exportUrl("csv")}>CSV</a>
          <a className="ghost-button" href={exportUrl("pdf")}>PDF</a>
        </div>
      </section>

      {error && <div className="error">{error}</div>}
      {busy && <div className="busy">{busy}</div>}

      <section className="grid">
        <aside className="panel sidebar">
          <h2>Batch</h2>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Month
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <button onClick={create}>New batch</button>

          <div className="batch-list">
            {batches.map((batch) => (
              <button
                key={batch.id}
                className={batch.id === activeId ? "batch active" : "batch"}
                onClick={() => setActiveId(batch.id)}
              >
                <strong>{batch.title}</strong>
                <span>{batch.month} · {batch.summary.ordersTotal} orders</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="workspace">
          <div className="stats">
            <Stat label="Net spend" value={`฿${fmt(summary?.netSpend ?? 0)}`} />
            <Stat label="Completed" value={`฿${fmt(summary?.completedSpend ?? 0)}`} />
            <Stat label="Orders" value={String(summary?.ordersTotal ?? 0)} />
            <Stat label="Review" value={String(reviewCount || summary?.ordersNeedingReview || 0)} warn={reviewCount > 0} />
          </div>

          <section className="panel upload-panel">
            <div>
              <h2>{activeBatch?.title ?? "No batch selected"}</h2>
              <p>{summary?.screenshotsTotal ?? 0} screenshots · {summary?.screenshotsProcessed ?? 0} processed · {summary?.screenshotsFailed ?? 0} failed</p>
            </div>
            <input type="file" multiple accept="image/*" onChange={(e) => setFiles(e.target.files)} />
            <button onClick={upload} disabled={!activeId || !files?.length}>Upload</button>
            <button onClick={() => process(false)} disabled={!activeId}>Process</button>
            <button className="ghost-button" onClick={() => process(true)} disabled={!activeId}>Reprocess</button>
          </section>

          <section className="panel">
            <div className="table-head">
              <h2>Orders</h2>
              <span>{orders.length} rows</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>App</th>
                    <th>Restaurant</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Refund</th>
                    <th>Net</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className={order.review_state === "needs_review" ? "needs-review" : ""}>
                      <td>
                        <input
                          value={order.ordered_at.slice(0, 16)}
                          onChange={(e) => updateOrder(order.id, { ordered_at: e.target.value })}
                        />
                      </td>
                      <td>{order.source_app}</td>
                      <td>
                        <input
                          value={order.restaurant_name}
                          onChange={(e) => updateOrder(order.id, { restaurant_name: e.target.value })}
                        />
                      </td>
                      <td>
                        <select value={order.status} onChange={(e) => updateOrder(order.id, { status: e.target.value })}>
                          <option value="completed">completed</option>
                          <option value="cancelled">cancelled</option>
                          <option value="refunded">refunded</option>
                          <option value="unknown">unknown</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={order.total_amount}
                          onChange={(e) => updateOrder(order.id, { total_amount: Number(e.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={order.refund_amount}
                          onChange={(e) => updateOrder(order.id, { refund_amount: Number(e.target.value) })}
                        />
                      </td>
                      <td>฿{fmt(order.net_amount)}</td>
                      <td><span className={`pill ${order.review_state}`}>{order.review_state}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function Stat(props: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={props.warn ? "stat warn" : "stat"}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
