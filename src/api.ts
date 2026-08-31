export type BatchSummary = {
  batchId: string;
  screenshotsTotal: number;
  screenshotsProcessed: number;
  screenshotsFailed: number;
  ordersTotal: number;
  ordersNeedingReview: number;
  ordersBlocked: number;
  netSpend: number;
  completedSpend: number;
  grossSpend: number;
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

export type RestaurantTally = { name: string; count: number; spend: number };

export type MonthBucket = {
  month: string;
  orderCount: number;
  netSpend: number;
  completedSpend: number;
  grossSpend: number;
  refundedOrCancelled: number;
  reviewCount: number;
  byAppSpend: Record<string, number>;
  byAppCount: Record<string, number>;
  topRestaurants: RestaurantTally[];
  firstDate: string;
  lastDate: string;
};

export type LedgerDashboard = {
  confirmedNet: number;
  grossSpend: number;
  refundedOrCancelled: number;
  orderCount: number;
  blockedCount: number;
  restaurantCount: number;
  monthCount: number;
  byAppSpend: Record<string, number>;
  months: MonthBucket[];
};

export type BatchRollup = {
  batchId: string;
  screenshotsTotal: number;
  screenshotsProcessed: number;
  screenshotsFailed: number;
  newOrders: number;
  mergedOrders: number;
  reviewCount: number;
  blockedCount: number;
  netPosted: number;
  periods: string[];
};

export type OrderObservation = {
  id: string;
  batch_id: string;
  screenshot_id?: string;
  order_id?: string;
  screen_order: number;
  raw_json: string;
  normalized_json: string;
  attention_reasons_json: string;
  created_at: number;
};

export type DatePrecision = "full" | "month" | "none";
export type ReviewTier = "clean" | "review" | "blocked";
export type OrderFlag = {
  code: string;
  field: string;
  severity: "info" | "warn" | "block";
  detail?: string;
};

export type OrderRow = {
  id: string;
  batch_id: string;
  source_app: string;
  ordered_at: string;
  date_precision: DatePrecision;
  restaurant_name: string;
  branch: string;
  total_amount: number;
  status: string;
  refund_amount: number;
  net_amount: number;
  item_count: number;
  currency: string;
  items_text: string;
  confidence: number;
  review_tier: ReviewTier;
  review_state: "ok" | "needs_check" | "corrected";
  flags_json: string;
  user_edited: 0 | 1;
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
  llm_usage_json: string;
  llm_cost_usd: number;
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
  pdf_style: PdfStyle;
};

export type PdfStyle = "midnight" | "minimal" | "audit";

export type ProviderModel = {
  id: string;
  name: string;
  context_length: number;
  pricing?: { prompt?: string | number; completion?: string | number; image?: string | number; request?: string | number };
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

  processScreenshot: (screenshotId: string) =>
    api<{ summary: BatchSummary }>(`/api/screenshots/${screenshotId}/process`, {
      method: "POST"
    }),

  stopProcessing: () => api<{ stopped: boolean }>("/api/processing/stop", { method: "POST" }),

  listOrders: (batchId: string) =>
    api<{ orders: OrderRow[]; summary: BatchSummary }>(`/api/batches/${batchId}/orders`),

  listAllOrders: () => api<{ orders: OrderRow[] }>("/api/orders"),

  ledgerDashboard: () => api<{ dashboard: LedgerDashboard }>("/api/ledger/dashboard"),
  ledgerOrders: (period?: string) =>
    api<{ orders: OrderRow[] }>(`/api/ledger/orders${period ? `?period=${encodeURIComponent(period)}` : ""}`),
  batchRollup: (batchId: string) => api<{ rollup: BatchRollup }>(`/api/batches/${batchId}/rollup`),
  orderObservations: (orderId: string) =>
    api<{ observations: OrderObservation[] }>(`/api/orders/${orderId}/observations`),

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

  exportUrl: (batchId: string, kind: "xls" | "csv" | "pdf", month?: string, pdfStyle?: PdfStyle) => {
    const query = new URLSearchParams();
    if (month) query.set("month", month);
    if (kind === "pdf" && pdfStyle) query.set("style", pdfStyle);
    const suffix = query.toString();
    return `/api/batches/${batchId}/export.${kind}${suffix ? `?${suffix}` : ""}`;
  },

  ledgerExportUrl: (kind: "xls" | "csv" | "pdf", period?: string, pdfStyle?: PdfStyle) => {
    const query = new URLSearchParams();
    if (period && period !== "all") query.set("period", period);
    if (kind === "pdf" && pdfStyle) query.set("style", pdfStyle);
    const suffix = query.toString();
    return `/api/ledger/export.${kind}${suffix ? `?${suffix}` : ""}`;
  }
};

export function parseLlmUsage(value: string) {
  try {
    const raw = JSON.parse(value || "{}");
    return {
      promptTokens: Number(raw?.promptTokens ?? 0) || 0,
      completionTokens: Number(raw?.completionTokens ?? 0) || 0,
      totalTokens: Number(raw?.totalTokens ?? 0) || 0,
      costUsd: Number(raw?.costUsd ?? 0) || 0
    };
  } catch {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
  }
}

export function modelPricePerMillion(value: string | number | undefined) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate * 1_000_000 : null;
}

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

export function parseFlags(value: string | null | undefined): OrderFlag[] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f) => f && typeof f.code === "string")
      .map((f) => ({
        code: String(f.code),
        field: String(f.field ?? ""),
        severity: f.severity === "block" || f.severity === "warn" ? f.severity : "info",
        detail: f.detail ? String(f.detail) : undefined
      }));
  } catch {
    return [];
  }
}

/** Short Thai chip label for a flag, falling back to the flag's own detail then code. */
export function flagLabel(flag: OrderFlag): string {
  const LABELS: Record<string, string> = {
    amount_missing: "อ่านยอดไม่ได้",
    amount_unverified: "OCR ยืนยันยอดไม่ได้",
    date_missing: "อ่านวันที่ไม่ได้",
    date_relative: "วันที่ไม่ชัด",
    date_month_only: "รู้แค่เดือน",
    status_unknown: "ไม่รู้สถานะ",
    restaurant_missing: "ไม่มีชื่อร้าน",
    app_unknown: "ไม่รู้แอป",
    card_partial: "การ์ดถูกตัด",
    multi_weak: "หลายจุดไม่ชัด",
    dup_conflict: "อาจซ้ำ",
    refund_exceeds_total: "ยอดคืน > ยอดรวม",
    restaurant_truncated: "ชื่อร้านถูกตัด",
    orphaned: "ต้นฉบับถูกลบ"
  };
  return LABELS[flag.code] ?? flag.detail ?? flag.code;
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

export function fmtDateTime(value: string, precision?: DatePrecision) {
  if (!value || precision === "none") return "";
  // Month-only (Shopee has no time, or a sibling-inferred month): show the month.
  if (precision === "month" || /^\d{4}-\d{2}$/.test(value)) {
    return fmtMonthLabel(value.slice(0, 7));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  // Bug B7: a bare date (no real time, e.g. Shopee) must not render "00:00".
  const hasTime = /T(?!00:00(?::00)?$)\d{2}:\d{2}/.test(value);
  if (hasTime) {
    opts.hour = "2-digit";
    opts.minute = "2-digit";
  }
  return date.toLocaleString("en-GB", opts);
}

export const SOURCE_APP_LABEL: Record<string, string> = {
  grab: "Grab",
  lineman: "LINE MAN",
  shopeefood: "ShopeeFood",
  unknown: "Unknown"
};

/* CVD-validated categorical palette (lightness band, chroma floor, adjacent-pair
   separation, 3:1 contrast on white). Unknown is a deliberate neutral "other" slot. */
export const SOURCE_APP_COLOR: Record<string, string> = {
  grab: "#2e7d32",
  lineman: "#0369a1",
  shopeefood: "#e8590c",
  unknown: "#5b665f"
};

export const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  unknown: "Unknown"
};
