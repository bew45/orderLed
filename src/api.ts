export type BatchSummary = {
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

export type BatchListItem = {
  id: string;
  title: string;
  month: string;
  created_at: number;
  updated_at: number;
  summary: BatchSummary;
};

export type OrderRow = {
  id: string;
  batch_id: string;
  source_app: string;
  ordered_at: string;
  restaurant_name: string;
  total_amount: number;
  status: string;
  refund_amount: number;
  net_amount: number;
  items_text: string;
  review_state: "ok" | "needs_check" | "corrected";
  duplicate_key: string;
  source_screenshot_ids_json: string;
  evidence_json: string;
};

export type AmountCheckState = "not_checked" | "matched" | "mismatch" | "unavailable";
export type ProcessingStepStatus = "not_started" | "queued" | "running" | "done" | "failed" | "skipped";

export type AmountCandidate = {
  amount: number;
  text: string;
  rowId?: string;
  bbox?: { x: number; y: number; w: number; h: number };
};

export type AmountCheck = {
  state: AmountCheckState;
  aiAmounts: number[];
  scannerAmounts: number[];
  missingFromAi: number[];
  missingFromScanner: number[];
  sumAi: number;
  sumScanner: number;
  reasons: string[];
  aiCandidates: AmountCandidate[];
  scannerCandidates: AmountCandidate[];
};

export type ScreenshotRow = {
  id: string;
  batch_id: string;
  original_name: string;
  storage_path: string;
  content_hash: string;
  source_app_guess: string;
  width: number;
  height: number;
  ocr_text_json: string;
  ocr_line_count: number;
  extracted_order_count: number;
  extraction_engine: string;
  amount_check_state: AmountCheckState;
  amount_check_json: string;
  ocr_status: ProcessingStepStatus;
  ocr_error: string;
  ocr_completed_at: number;
  llm_status: ProcessingStepStatus;
  llm_error: string;
  llm_completed_at: number;
  processed_at: number;
  error: string;
  created_at: number;
  updated_at: number;
};

export type OcrTextRow = {
  id: string;
  text: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
};

export type AppSettings = {
  openrouter_api_key: string;
  openrouter_model: string;
  openrouter_base_url: string;
  paddle_python: string;
  paddle_lang: string;
  paddle_device: string;
  paddle_timeout_ms: number;
  ocr_amount_checker_enabled: boolean;
  favorite_models: string[];
  promptpay_qr_enabled: boolean;
  promptpay_amount_locked: boolean;
  promptpay_id: string;
  promptpay_recipient_name: string;
};

export type ProviderModel = {
  id: string;
  name: string;
  context_length: number;
  pricing?: Record<string, unknown>;
};

export type UploadResult = {
  added: Array<{ id: string; original_name: string }>;
  skipped: Array<{ filename: string; reason: string }>;
  summary: BatchSummary;
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

export function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

export const endpoints = {
  listBatches: () => api<{ batches: BatchListItem[] }>("/api/batches"),
  createBatch: (input: { title: string; month: string }) =>
    api<{ batch: BatchListItem }>("/api/batches", { method: "POST", body: JSON.stringify(input) }),
  deleteBatch: (id: string) => api<{ ok: true }>(`/api/batches/${id}`, { method: "DELETE" }),

  uploadScreenshots: (batchId: string, files: FileList | File[]) => {
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));
    return api<UploadResult>(`/api/batches/${batchId}/screenshots`, { method: "POST", body: form });
  },

  processBatch: (batchId: string, force = false) =>
    api<{ summary: BatchSummary }>(`/api/batches/${batchId}/process`, {
      method: "POST",
      body: JSON.stringify({ force })
    }),

  stopProcessing: () => api<{ stopped: boolean }>("/api/processing/stop", { method: "POST" }),

  listOrders: (batchId: string) =>
    api<{ orders: OrderRow[]; summary: BatchSummary }>(`/api/batches/${batchId}/orders`),

  listAllOrders: () => api<{ orders: OrderRow[] }>("/api/orders"),

  listScreenshots: (batchId: string) =>
    api<{ screenshots: ScreenshotRow[]; summary: BatchSummary }>(`/api/batches/${batchId}/screenshots`),

  updateOrder: (id: string, patch: Partial<OrderRow>) =>
    api<{ order: OrderRow }>(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  createOrder: (input: Partial<OrderRow> & { source_screenshot_id: string }) =>
    api<{ order: OrderRow }>("/api/orders", { method: "POST", body: JSON.stringify(input) }),

  deleteOrder: (id: string) => api<{ ok: true }>(`/api/orders/${id}`, { method: "DELETE" }),

  getSettings: () => api<{ settings: AppSettings }>("/api/settings"),
  saveSettings: (patch: Partial<AppSettings>) =>
    api<{ settings: AppSettings }>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  getModels: () => api<{ models: ProviderModel[] }>("/api/settings/openrouter-models"),

  screenshotImageUrl: (id: string) => `/api/screenshots/${id}/image`,
  deleteScreenshot: (id: string) => api<{ ok: true }>(`/api/screenshots/${id}`, { method: "DELETE" }),

  exportUrl: (batchId: string, kind: "xls" | "csv" | "pdf", month?: string) =>
    `/api/batches/${batchId}/export.${kind}${month ? `?month=${encodeURIComponent(month)}` : ""}`
};

export function parseAmountCheck(value: string): AmountCheck | null {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || typeof parsed.state !== "string") return null;
    return {
      state: parsed.state,
      aiAmounts: Array.isArray(parsed.aiAmounts) ? parsed.aiAmounts.map(Number).filter(Number.isFinite) : [],
      scannerAmounts: Array.isArray(parsed.scannerAmounts) ? parsed.scannerAmounts.map(Number).filter(Number.isFinite) : [],
      missingFromAi: Array.isArray(parsed.missingFromAi) ? parsed.missingFromAi.map(Number).filter(Number.isFinite) : [],
      missingFromScanner: Array.isArray(parsed.missingFromScanner) ? parsed.missingFromScanner.map(Number).filter(Number.isFinite) : [],
      sumAi: Number(parsed.sumAi || 0),
      sumScanner: Number(parsed.sumScanner || 0),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [],
      aiCandidates: Array.isArray(parsed.aiCandidates) ? parsed.aiCandidates : [],
      scannerCandidates: Array.isArray(parsed.scannerCandidates) ? parsed.scannerCandidates : []
    };
  } catch {
    return null;
  }
}

export function firstScreenshotId(order: OrderRow): string | null {
  try {
    const ids = JSON.parse(order.source_screenshot_ids_json || "[]");
    return Array.isArray(ids) && ids.length > 0 ? String(ids[0]) : null;
  } catch {
    return null;
  }
}

export function fmtMoney(value: number) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

export function fmtMonthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function fmtDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const SOURCE_APP_LABEL: Record<string, string> = {
  grab: "Grab",
  lineman: "LINE MAN",
  shopeefood: "ShopeeFood",
  unknown: "Unknown"
};

export const SOURCE_APP_COLOR: Record<string, string> = {
  grab: "#0a8a3f",
  lineman: "#3a3530",
  shopeefood: "#ee4d2d",
  unknown: "#5b665f"
};

export const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  unknown: "Unknown"
};
