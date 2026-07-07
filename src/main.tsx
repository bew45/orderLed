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

type AppSettings = {
  openrouter_api_key: string;
  openrouter_model: string;
  openrouter_base_url: string;
  paddle_python: string;
  paddle_lang: string;
  paddle_timeout_ms: number;
  favorite_models: string[];
};

type ProviderModel = {
  id: string;
  name: string;
  context_length: number;
  pricing?: Record<string, unknown>;
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
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          <button className="ghost-button" onClick={() => setSettingsOpen(true)}>Settings</button>
          <a className="export-button" href={exportUrl("xls")}>Export Excel</a>
          <a className="ghost-button" href={exportUrl("csv")}>CSV</a>
          <a className="ghost-button" href={exportUrl("pdf")}>PDF</a>
        </div>
      </section>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}

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

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [search, setSearch] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ settings: AppSettings }>("/api/settings")
      .then((data) => {
        setSettings(data.settings);
        setDraft(data.settings);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    setLoadingModels(true);
    api<{ models: ProviderModel[] }>("/api/settings/openrouter-models")
      .then((data) => setModels(data.models))
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, []);

  if (!draft) {
    return (
      <div className="settings-overlay">
        <button className="settings-scrim" onClick={onClose} aria-label="Close settings" />
        <section className="settings-sheet">
          <div className="settings-head">
            <div>
              <p className="eyebrow">settings</p>
              <h2>Extraction setup</h2>
            </div>
            <button className="ghost-button" onClick={onClose}>Close</button>
          </div>
          <div className="settings-empty">{error || "Loading settings..."}</div>
        </section>
      </div>
    );
  }

  const favoriteSet = new Set(draft.favorite_models);
  const q = search.trim().toLowerCase();
  const favoriteModels = draft.favorite_models
    .map((id) => models.find((model) => model.id === id) ?? { id, name: id, context_length: 0 })
    .filter((model) => !q || model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q));
  const visibleModels = models.filter((model) => !q || model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q));

  function patch(patchValue: Partial<AppSettings>) {
    setDraft((current) => current ? { ...current, ...patchValue } : current);
  }

  function toggleFavorite(modelId: string) {
    if (!draft) return;
    const next = favoriteSet.has(modelId)
      ? draft.favorite_models.filter((id) => id !== modelId)
      : [...draft.favorite_models, modelId];
    patch({ favorite_models: next });
  }

  async function save() {
    if (!draft) return;
    setError("");
    setNote("Saving...");
    try {
      const payload = {
        ...draft,
        openrouter_api_key: draft.openrouter_api_key === settings?.openrouter_api_key ? draft.openrouter_api_key : draft.openrouter_api_key
      };
      const data = await api<{ settings: AppSettings }>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setSettings(data.settings);
      setDraft(data.settings);
      setNote("Saved");
    } catch (err: any) {
      setNote("");
      setError(err.message);
    }
  }

  function pickModel(modelId: string) {
    patch({ openrouter_model: modelId });
  }

  return (
    <div className="settings-overlay">
      <button className="settings-scrim" onClick={onClose} aria-label="Close settings" />
      <section className="settings-sheet">
        <div className="settings-head">
          <div>
            <p className="eyebrow">settings</p>
            <h2>Extraction setup</h2>
            <p>OpenRouter is the recommended accurate path for iPhone screenshot extraction.</p>
          </div>
          <button className="ghost-button" onClick={onClose}>Close</button>
        </div>

        {error && <div className="error">{error}</div>}
        {note && <div className="busy">{note}</div>}

        <div className="settings-grid">
          <section className="settings-card">
            <div className="settings-section-title">
              <span>Vision extractor</span>
              <strong>OpenRouter</strong>
            </div>
            <label>
              API key
              <input
                type="password"
                value={draft.openrouter_api_key}
                placeholder="sk-or-..."
                onChange={(e) => patch({ openrouter_api_key: e.target.value })}
              />
            </label>
            <label>
              Base URL
              <input value={draft.openrouter_base_url} onChange={(e) => patch({ openrouter_base_url: e.target.value })} />
            </label>
            <label>
              Selected model
              <input value={draft.openrouter_model} onChange={(e) => patch({ openrouter_model: e.target.value })} />
            </label>
          </section>

          <section className="settings-card">
            <div className="settings-section-title">
              <span>Local OCR</span>
              <strong>optional</strong>
            </div>
            <label>
              Python path
              <input value={draft.paddle_python} placeholder=".venv-ocr\\Scripts\\python.exe" onChange={(e) => patch({ paddle_python: e.target.value })} />
            </label>
            <div className="settings-two">
              <label>
                OCR language
                <input value={draft.paddle_lang} onChange={(e) => patch({ paddle_lang: e.target.value })} />
              </label>
              <label>
                Timeout ms
                <input type="number" value={draft.paddle_timeout_ms} onChange={(e) => patch({ paddle_timeout_ms: Number(e.target.value) })} />
              </label>
            </div>
          </section>
        </div>

        <section className="settings-card model-picker-card">
          <div className="settings-section-title">
            <span>Model picker</span>
            <strong>{loadingModels ? "loading" : `${models.length} models`}</strong>
          </div>
          <div className="model-toolbar">
            <button className="provider-chip is-on">OpenRouter</button>
            <input value={search} placeholder="Search models" onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="model-list">
            {favoriteModels.length > 0 && <div className="model-section">Favorites</div>}
            {favoriteModels.map((model) => (
              <ModelRow
                key={`fav-${model.id}`}
                model={model}
                selected={draft.openrouter_model === model.id}
                favorite={favoriteSet.has(model.id)}
                onPick={() => pickModel(model.id)}
                onFavorite={() => toggleFavorite(model.id)}
              />
            ))}
            <div className="model-section">All models</div>
            {loadingModels ? (
              <div className="settings-empty">Loading models...</div>
            ) : visibleModels.length === 0 ? (
              <div className="settings-empty">No models loaded. You can still type a model manually above.</div>
            ) : (
              visibleModels.slice(0, 140).map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  selected={draft.openrouter_model === model.id}
                  favorite={favoriteSet.has(model.id)}
                  onPick={() => pickModel(model.id)}
                  onFavorite={() => toggleFavorite(model.id)}
                />
              ))
            )}
          </div>
        </section>

        <div className="settings-actions">
          <button className="ghost-button" onClick={onClose}>Cancel</button>
          <button onClick={save}>Save settings</button>
        </div>
      </section>
    </div>
  );
}

function ModelRow(props: {
  model: ProviderModel;
  selected: boolean;
  favorite: boolean;
  onPick: () => void;
  onFavorite: () => void;
}) {
  return (
    <div className={props.selected ? "model-row selected" : "model-row"}>
      <button className="model-main" onClick={props.onPick}>
        <span className="model-check">{props.selected ? "✓" : ""}</span>
        <span className="model-name">{props.model.name || props.model.id}</span>
        <span className="model-id">{props.model.id}</span>
        {props.model.context_length ? <span className="model-meta">{props.model.context_length.toLocaleString()} ctx</span> : null}
      </button>
      <button className={props.favorite ? "model-star on" : "model-star"} onClick={props.onFavorite} aria-label="Favorite model">
        {props.favorite ? "★" : "☆"}
      </button>
    </div>
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
