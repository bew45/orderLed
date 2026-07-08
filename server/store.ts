import { db, now, uuid } from "./db";
import { deleteStoredImage } from "./image-store";
import { json, parseJson } from "./json";
import type { AmountCheck, AppSettings, Batch, BatchSummary, OcrRow, OrderRow, ReviewState, Screenshot, SourceApp } from "./types";

function one<T>(value: unknown) {
  return value as T | undefined;
}

export function createBatch(input: { title?: string; month?: string }) {
  const ts = now();
  const month = String(input.month || new Date().toISOString().slice(0, 7));
  const title = String(input.title || `Food order import ${month}`).trim();
  const batch: Batch = { id: uuid("batch"), title, month, created_at: ts, updated_at: ts };
  db.prepare("INSERT INTO batches (id, title, month, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(batch.id, batch.title, batch.month, batch.created_at, batch.updated_at);
  return batch;
}

export function listBatches() {
  const rows = db.prepare("SELECT * FROM batches ORDER BY updated_at DESC").all() as Batch[];
  return rows.map((batch) => ({ ...batch, summary: getBatchSummary(batch.id) }));
}

export function getBatch(id: string) {
  return one<Batch>(db.prepare("SELECT * FROM batches WHERE id=?").get(id));
}

export function deleteBatch(id: string) {
  const shots = listScreenshots(id);
  const result = db.prepare("DELETE FROM batches WHERE id=?").run(id);
  for (const shot of shots) deleteStoredImage(shot.storage_path);
  return result.changes > 0;
}

export function addScreenshot(input: {
  id?: string;
  batchId: string;
  originalName: string;
  storagePath: string;
  contentHash: string;
  sourceAppGuess: SourceApp;
  width: number;
  height: number;
}) {
  const ts = now();
  const screenshot: Screenshot = {
    id: input.id ?? uuid("shot"),
    batch_id: input.batchId,
    original_name: input.originalName,
    storage_path: input.storagePath,
    content_hash: input.contentHash,
    source_app_guess: input.sourceAppGuess,
    width: input.width,
    height: input.height,
    ocr_text_json: "[]",
    ocr_line_count: 0,
    extracted_order_count: 0,
    extraction_engine: "",
    amount_check_state: "not_checked",
    amount_check_json: "{}",
    ocr_status: "not_started",
    ocr_error: "",
    ocr_completed_at: 0,
    llm_status: "not_started",
    llm_error: "",
    llm_completed_at: 0,
    processed_at: 0,
    error: "",
    created_at: ts,
    updated_at: ts
  };
  db.prepare(`
    INSERT INTO screenshots
      (id, batch_id, original_name, storage_path, content_hash, source_app_guess, width, height, ocr_text_json, ocr_line_count, extracted_order_count, extraction_engine, amount_check_state, amount_check_json, ocr_status, ocr_error, ocr_completed_at, llm_status, llm_error, llm_completed_at, processed_at, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    screenshot.id,
    screenshot.batch_id,
    screenshot.original_name,
    screenshot.storage_path,
    screenshot.content_hash,
    screenshot.source_app_guess,
    screenshot.width,
    screenshot.height,
    screenshot.ocr_text_json,
    screenshot.ocr_line_count,
    screenshot.extracted_order_count,
    screenshot.extraction_engine,
    screenshot.amount_check_state,
    screenshot.amount_check_json,
    screenshot.ocr_status,
    screenshot.ocr_error,
    screenshot.ocr_completed_at,
    screenshot.llm_status,
    screenshot.llm_error,
    screenshot.llm_completed_at,
    screenshot.processed_at,
    screenshot.error,
    screenshot.created_at,
    screenshot.updated_at
  );
  touchBatch(input.batchId);
  return screenshot;
}

export function screenshotHashExists(batchId: string, contentHash: string) {
  return Boolean(db.prepare("SELECT id FROM screenshots WHERE batch_id=? AND content_hash=?").get(batchId, contentHash));
}

export function listScreenshots(batchId: string) {
  return db.prepare("SELECT * FROM screenshots WHERE batch_id=? ORDER BY created_at").all(batchId) as Screenshot[];
}

export function getScreenshot(id: string) {
  return one<Screenshot>(db.prepare("SELECT * FROM screenshots WHERE id=?").get(id));
}

export function deleteScreenshot(id: string) {
  const shot = getScreenshot(id);
  if (!shot) return false;
  const ts = now();

  try {
    db.exec("BEGIN");
    removeScreenshotOrderReferences(id, shot.batch_id, ts);
    db.prepare("DELETE FROM screenshots WHERE id=?").run(id);
    db.prepare("UPDATE batches SET updated_at=? WHERE id=?").run(ts, shot.batch_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  deleteStoredImage(shot.storage_path);
  return true;
}

export function clearScreenshotExtraction(id: string) {
  const shot = getScreenshot(id);
  if (!shot) return;
  const ts = now();
  removeScreenshotOrderReferences(id, shot.batch_id, ts);
  db.prepare(`
    UPDATE screenshots SET
      ocr_text_json='[]',
      ocr_line_count=0,
      extracted_order_count=0,
      extraction_engine='',
      amount_check_state='not_checked',
      amount_check_json='{}',
      ocr_status='queued',
      ocr_error='',
      ocr_completed_at=0,
      llm_status='queued',
      llm_error='',
      llm_completed_at=0,
      processed_at=0,
      error='',
      updated_at=?
    WHERE id=?
  `).run(ts, id);
  touchBatch(shot.batch_id);
}

export function markScreenshotOcr(id: string, input: {
  status: Screenshot["ocr_status"];
  rows?: OcrRow[];
  sourceAppGuess?: SourceApp;
  error?: string;
}) {
  const current = getScreenshot(id);
  const ts = now();
  db.prepare(`
    UPDATE screenshots SET
      source_app_guess=?,
      ocr_text_json=?,
      ocr_line_count=?,
      ocr_status=?,
      ocr_error=?,
      ocr_completed_at=?,
      updated_at=?
    WHERE id=?
  `).run(
    input.sourceAppGuess ?? current?.source_app_guess ?? "unknown",
    input.rows ? json(input.rows) : current?.ocr_text_json ?? "[]",
    input.rows?.length ?? current?.ocr_line_count ?? 0,
    input.status,
    input.error ?? "",
    ["done", "failed", "skipped"].includes(input.status) ? ts : current?.ocr_completed_at ?? 0,
    ts,
    id
  );
  if (current) touchBatch(current.batch_id);
}

export function markScreenshotLlm(id: string, input: {
  status: Screenshot["llm_status"];
  extractionEngine?: string;
  error?: string;
}) {
  const current = getScreenshot(id);
  const ts = now();
  db.prepare(`
    UPDATE screenshots SET
      llm_status=?,
      llm_error=?,
      llm_completed_at=?,
      extraction_engine=?,
      updated_at=?
    WHERE id=?
  `).run(
    input.status,
    input.error ?? "",
    ["done", "failed"].includes(input.status) ? ts : current?.llm_completed_at ?? 0,
    input.extractionEngine ?? current?.extraction_engine ?? "",
    ts,
    id
  );
  if (current) touchBatch(current.batch_id);
}

function removeScreenshotOrderReferences(screenshotId: string, batchId: string, ts: number) {
  const orders = listOrders(batchId);
  for (const order of orders) {
    const ids = parseJson<string[]>(order.source_screenshot_ids_json, []);
    if (!ids.includes(screenshotId)) continue;
    const nextIds = ids.filter((sourceId) => sourceId !== screenshotId);
    if (nextIds.length === 0) {
      db.prepare("DELETE FROM orders WHERE id=?").run(order.id);
    } else {
      db.prepare("UPDATE orders SET source_screenshot_ids_json=?, updated_at=? WHERE id=?")
        .run(json(nextIds), ts, order.id);
    }
  }
}

export function markScreenshotProcessed(id: string, input: {
  error?: string;
  ocrRows?: OcrRow[];
  sourceAppGuess?: SourceApp;
  extractedOrderCount?: number;
  extractionEngine?: string;
  amountCheck?: AmountCheck;
} = {}) {
  const ts = now();
  const error = input.error ?? "";
  const current = getScreenshot(id);
  db.prepare(`
    UPDATE screenshots SET
      source_app_guess=?,
      ocr_text_json=?,
      ocr_line_count=?,
      extracted_order_count=?,
      extraction_engine=?,
      amount_check_state=?,
      amount_check_json=?,
      processed_at=?,
      error=?,
      updated_at=?
    WHERE id=?
  `).run(
    input.sourceAppGuess ?? current?.source_app_guess ?? "unknown",
    json(input.ocrRows ?? parseJson<OcrRow[]>(current?.ocr_text_json, [])),
    input.ocrRows?.length ?? current?.ocr_line_count ?? 0,
    input.extractedOrderCount ?? current?.extracted_order_count ?? 0,
    input.extractionEngine ?? current?.extraction_engine ?? "",
    input.amountCheck?.state ?? current?.amount_check_state ?? "not_checked",
    input.amountCheck ? json(input.amountCheck) : current?.amount_check_json ?? "{}",
    error ? 0 : ts,
    error,
    ts,
    id
  );
  if (current) touchBatch(current.batch_id);
}

export function upsertOrder(input: {
  batchId: string;
  sourceApp: SourceApp;
  orderedAt: string;
  restaurantName: string;
  totalAmount: number;
  status: string;
  refundAmount: number;
  netAmount: number;
  itemsText: string;
  reviewState: ReviewState;
  duplicateKey: string;
  sourceScreenshotId: string;
  evidence: unknown;
}) {
  const existing = one<OrderRow>(
    db.prepare("SELECT * FROM orders WHERE batch_id=? AND duplicate_key=?").get(input.batchId, input.duplicateKey)
  );
  const ts = now();
  if (existing) {
    const ids = new Set(parseJson<string[]>(existing.source_screenshot_ids_json, []));
    ids.add(input.sourceScreenshotId);
    const currentReviewState = normalizeReviewState(existing.review_state);
    const reviewState: ReviewState = currentReviewState === "corrected"
      ? "corrected"
      : input.reviewState === "needs_check" || currentReviewState === "needs_check"
        ? "needs_check"
        : "ok";
    const shouldReplace = currentReviewState !== "corrected" && completenessScore(input) >= completenessScore(existing);
    db.prepare(`
      UPDATE orders SET
        source_app=?,
        ordered_at=?,
        restaurant_name=?,
        total_amount=?,
        status=?,
        refund_amount=?,
        net_amount=?,
        items_text=?,
        review_state=?,
        source_screenshot_ids_json=?,
        evidence_json=?,
        updated_at=?
      WHERE id=?
    `).run(
      shouldReplace ? input.sourceApp : existing.source_app,
      shouldReplace ? input.orderedAt : existing.ordered_at,
      shouldReplace ? input.restaurantName : existing.restaurant_name,
      shouldReplace ? input.totalAmount : existing.total_amount,
      shouldReplace ? input.status : existing.status,
      shouldReplace ? input.refundAmount : existing.refund_amount,
      shouldReplace ? input.netAmount : existing.net_amount,
      shouldReplace ? input.itemsText : existing.items_text,
      reviewState,
      json([...ids]),
      shouldReplace ? json(input.evidence) : existing.evidence_json,
      ts,
      existing.id
    );
    return getOrder(existing.id)!;
  }

  const order: OrderRow = {
    id: uuid("order"),
    batch_id: input.batchId,
    source_app: input.sourceApp,
    ordered_at: input.orderedAt,
    restaurant_name: input.restaurantName,
    total_amount: input.totalAmount,
    status: input.status as OrderRow["status"],
    refund_amount: input.refundAmount,
    net_amount: input.netAmount,
    items_text: input.itemsText,
    review_state: input.reviewState,
    duplicate_key: input.duplicateKey,
    source_screenshot_ids_json: json([input.sourceScreenshotId]),
    evidence_json: json(input.evidence),
    created_at: ts,
    updated_at: ts
  };
  db.prepare(`
    INSERT INTO orders
      (id, batch_id, source_app, ordered_at, restaurant_name, total_amount, status, refund_amount, net_amount, items_text, review_state, duplicate_key, source_screenshot_ids_json, evidence_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    order.id,
    order.batch_id,
    order.source_app,
    order.ordered_at,
    order.restaurant_name,
    order.total_amount,
    order.status,
    order.refund_amount,
    order.net_amount,
    order.items_text,
    order.review_state,
    order.duplicate_key,
    order.source_screenshot_ids_json,
    order.evidence_json,
    order.created_at,
    order.updated_at
  );
  touchBatch(input.batchId);
  return order;
}

export function getOrder(id: string) {
  return one<OrderRow>(db.prepare("SELECT * FROM orders WHERE id=?").get(id));
}

export function listOrders(batchId: string) {
  return db.prepare("SELECT * FROM orders WHERE batch_id=? ORDER BY ordered_at DESC, restaurant_name").all(batchId) as OrderRow[];
}

export function listAllOrders() {
  return db.prepare("SELECT * FROM orders ORDER BY ordered_at DESC, restaurant_name").all() as OrderRow[];
}

export function updateOrder(id: string, patch: Partial<OrderRow>) {
  const current = getOrder(id);
  if (!current) return null;
  const next = {
    ...current,
    source_app: patch.source_app ?? current.source_app,
    ordered_at: patch.ordered_at ?? current.ordered_at,
    restaurant_name: patch.restaurant_name ?? current.restaurant_name,
    total_amount: Number(patch.total_amount ?? current.total_amount),
    status: patch.status ?? current.status,
    refund_amount: Number(patch.refund_amount ?? current.refund_amount),
    net_amount: Number(patch.net_amount ?? current.net_amount),
    items_text: patch.items_text ?? current.items_text,
    review_state: "corrected" as ReviewState,
    updated_at: now()
  };
  db.prepare(`
    UPDATE orders SET source_app=?, ordered_at=?, restaurant_name=?, total_amount=?, status=?, refund_amount=?, net_amount=?, items_text=?, review_state=?, updated_at=?
    WHERE id=?
  `).run(
    next.source_app,
    next.ordered_at,
    next.restaurant_name,
    next.total_amount,
    next.status,
    next.refund_amount,
    next.net_amount,
    next.items_text,
    next.review_state,
    next.updated_at,
    id
  );
  touchBatch(current.batch_id);
  return getOrder(id);
}

export function createManualOrder(input: {
  batchId: string;
  sourceScreenshotId: string;
  sourceApp: SourceApp;
  orderedAt: string;
  restaurantName: string;
  totalAmount: number;
  status: string;
  refundAmount: number;
  netAmount: number;
  itemsText: string;
}) {
  const batch = getBatch(input.batchId);
  if (!batch) throw new Error("Batch not found");
  const shot = getScreenshot(input.sourceScreenshotId);
  if (!shot || shot.batch_id !== input.batchId) throw new Error("Screenshot not found");

  const ts = now();
  const screenOrder = listOrders(input.batchId)
    .filter((order) => parseJson<string[]>(order.source_screenshot_ids_json, []).includes(input.sourceScreenshotId))
    .reduce((max, order) => {
      const evidence = parseJson<{ screenOrder?: number }>(order.evidence_json, {});
      const value = Number(evidence.screenOrder);
      return Number.isFinite(value) && value > max ? value : max;
    }, 0) + 1;
  const order: OrderRow = {
    id: uuid("order"),
    batch_id: input.batchId,
    source_app: input.sourceApp,
    ordered_at: input.orderedAt,
    restaurant_name: input.restaurantName,
    total_amount: input.totalAmount,
    status: input.status as OrderRow["status"],
    refund_amount: input.refundAmount,
    net_amount: input.netAmount,
    items_text: input.itemsText,
    review_state: "corrected",
    duplicate_key: `manual|${input.sourceScreenshotId}|${ts}|${Math.random().toString(36).slice(2)}`,
    source_screenshot_ids_json: json([input.sourceScreenshotId]),
    evidence_json: json({ manual: true, screenOrder }),
    created_at: ts,
    updated_at: ts
  };

  db.prepare(`
    INSERT INTO orders
      (id, batch_id, source_app, ordered_at, restaurant_name, total_amount, status, refund_amount, net_amount, items_text, review_state, duplicate_key, source_screenshot_ids_json, evidence_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    order.id,
    order.batch_id,
    order.source_app,
    order.ordered_at,
    order.restaurant_name,
    order.total_amount,
    order.status,
    order.refund_amount,
    order.net_amount,
    order.items_text,
    order.review_state,
    order.duplicate_key,
    order.source_screenshot_ids_json,
    order.evidence_json,
    order.created_at,
    order.updated_at
  );
  touchBatch(input.batchId);
  return order;
}

export function deleteOrder(id: string) {
  const order = getOrder(id);
  const result = db.prepare("DELETE FROM orders WHERE id=?").run(id);
  if (order) touchBatch(order.batch_id);
  return result.changes > 0;
}

export function getBatchSummary(batchId: string): BatchSummary {
  const shots = listScreenshots(batchId);
  const orders = listOrders(batchId);
  const completedSpend = orders.filter((o) => o.status === "completed").reduce((sum, o) => sum + o.total_amount, 0);
  const netSpend = orders.reduce((sum, o) => sum + o.net_amount, 0);
  return {
    batchId,
    screenshotsTotal: shots.length,
    screenshotsProcessed: shots.filter((s) => s.processed_at > 0).length,
    screenshotsFailed: shots.filter((s) => s.error).length,
    ordersTotal: orders.length,
    ordersNeedingReview: orders.filter((o) => normalizeReviewState(o.review_state) === "needs_check").length,
    netSpend: Math.round(netSpend * 100) / 100,
    completedSpend: Math.round(completedSpend * 100) / 100,
    refundedOrCancelled: Math.round((completedSpend - netSpend) * 100) / 100
  };
}

function normalizeReviewState(value: unknown): ReviewState {
  return value === "corrected" ? "corrected" : value === "ok" ? "ok" : "needs_check";
}

function completenessScore(order: {
  restaurantName?: string;
  restaurant_name?: string;
  orderedAt?: string;
  ordered_at?: string;
  totalAmount?: number;
  total_amount?: number;
  status?: string;
}) {
  let score = 0;
  if (String(order.restaurantName ?? order.restaurant_name ?? "").trim()) score += 2;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(order.orderedAt ?? order.ordered_at ?? ""))) score += 2;
  if (Number(order.totalAmount ?? order.total_amount ?? 0) > 0) score += 3;
  if (String(order.status ?? "") !== "unknown") score += 1;
  return score;
}

function touchBatch(id: string) {
  db.prepare("UPDATE batches SET updated_at=? WHERE id=?").run(now(), id);
}

const SETTINGS_KEY = "app";

function nonEmpty(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function booleanSetting(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

export function getAppSettings(): AppSettings {
  const settingsRow = one<{ value_json: string }>(db.prepare("SELECT value_json FROM app_settings WHERE key=?").get(SETTINGS_KEY));
  const saved = parseJson<Partial<AppSettings>>(settingsRow?.value_json, {});
  return {
    openrouter_api_key: nonEmpty(saved.openrouter_api_key, process.env.OPENROUTER_API_KEY),
    openrouter_model: nonEmpty(saved.openrouter_model, process.env.OPENROUTER_MODEL, "google/gemini-2.5-flash-lite"),
    openrouter_base_url: nonEmpty(saved.openrouter_base_url, process.env.OPENROUTER_BASE_URL, "https://openrouter.ai/api/v1"),
    paddle_python: nonEmpty(saved.paddle_python, process.env.ORDERLEDGER_PADDLE_PYTHON),
    paddle_lang: nonEmpty(saved.paddle_lang, process.env.ORDERLEDGER_PADDLE_LANG, "th"),
    paddle_device: nonEmpty(saved.paddle_device, process.env.ORDERLEDGER_PADDLE_DEVICE, "gpu"),
    paddle_timeout_ms: Number(saved.paddle_timeout_ms ?? process.env.ORDERLEDGER_PADDLE_TIMEOUT_MS ?? 90000),
    ocr_amount_checker_enabled: booleanSetting(saved.ocr_amount_checker_enabled ?? process.env.ORDERLEDGER_OCR_AMOUNT_CHECKER_ENABLED, true),
    favorite_models: Array.isArray(saved.favorite_models) ? saved.favorite_models.filter(Boolean) : [],
    promptpay_qr_enabled: booleanSetting(saved.promptpay_qr_enabled ?? process.env.ORDERLEDGER_PROMPTPAY_QR_ENABLED, false),
    promptpay_amount_locked: booleanSetting(saved.promptpay_amount_locked ?? process.env.ORDERLEDGER_PROMPTPAY_AMOUNT_LOCKED, true),
    promptpay_id: nonEmpty(saved.promptpay_id, process.env.ORDERLEDGER_PROMPTPAY_ID),
    promptpay_recipient_name: nonEmpty(saved.promptpay_recipient_name, process.env.ORDERLEDGER_PROMPTPAY_RECIPIENT_NAME)
  };
}

export function saveAppSettings(patch: Partial<AppSettings>) {
  const current = getAppSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    favorite_models: Array.isArray(patch.favorite_models) ? patch.favorite_models.filter(Boolean) : current.favorite_models,
    paddle_device: patch.paddle_device !== undefined ? String(patch.paddle_device).trim() || "gpu" : current.paddle_device,
    paddle_timeout_ms: Math.max(1000, Number(patch.paddle_timeout_ms ?? current.paddle_timeout_ms) || 90000),
    ocr_amount_checker_enabled: booleanSetting(patch.ocr_amount_checker_enabled, current.ocr_amount_checker_enabled),
    promptpay_qr_enabled: booleanSetting(patch.promptpay_qr_enabled, current.promptpay_qr_enabled),
    promptpay_amount_locked: booleanSetting(patch.promptpay_amount_locked, current.promptpay_amount_locked),
    promptpay_id: patch.promptpay_id !== undefined ? String(patch.promptpay_id).trim() : current.promptpay_id,
    promptpay_recipient_name: patch.promptpay_recipient_name !== undefined ? String(patch.promptpay_recipient_name).trim() : current.promptpay_recipient_name
  };
  db.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
  `).run(SETTINGS_KEY, json(next), now());
  return next;
}
