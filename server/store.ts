import { db, now, uuid } from "./db";
import { deleteStoredImage } from "./image-store";
import { json, parseJson } from "./json";
import type { AppSettings, Batch, BatchSummary, OcrRow, OrderRow, ReviewState, Screenshot, SourceApp } from "./types";

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
    processed_at: 0,
    error: "",
    created_at: ts,
    updated_at: ts
  };
  db.prepare(`
    INSERT INTO screenshots
      (id, batch_id, original_name, storage_path, content_hash, source_app_guess, width, height, ocr_text_json, ocr_line_count, extracted_order_count, processed_at, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  db.prepare("UPDATE screenshots SET extracted_order_count=0, updated_at=? WHERE id=?").run(ts, id);
  touchBatch(shot.batch_id);
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
      processed_at=?,
      error=?,
      updated_at=?
    WHERE id=?
  `).run(
    input.sourceAppGuess ?? current?.source_app_guess ?? "unknown",
    json(input.ocrRows ?? parseJson<OcrRow[]>(current?.ocr_text_json, [])),
    input.ocrRows?.length ?? current?.ocr_line_count ?? 0,
    input.extractedOrderCount ?? current?.extracted_order_count ?? 0,
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
  confidence: number;
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
    const reviewState: ReviewState = existing.review_state === "corrected"
      ? "corrected"
      : input.reviewState === "needs_review" || existing.review_state === "needs_review"
        ? "needs_review"
        : "ok";
    const shouldReplace = input.confidence > existing.confidence;
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
        confidence=?,
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
      Math.max(input.confidence, existing.confidence),
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
    confidence: input.confidence,
    review_state: input.reviewState,
    duplicate_key: input.duplicateKey,
    source_screenshot_ids_json: json([input.sourceScreenshotId]),
    evidence_json: json(input.evidence),
    created_at: ts,
    updated_at: ts
  };
  db.prepare(`
    INSERT INTO orders
      (id, batch_id, source_app, ordered_at, restaurant_name, total_amount, status, refund_amount, net_amount, items_text, confidence, review_state, duplicate_key, source_screenshot_ids_json, evidence_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    order.confidence,
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
    confidence: Number(patch.confidence ?? current.confidence),
    review_state: "corrected" as ReviewState,
    updated_at: now()
  };
  db.prepare(`
    UPDATE orders SET source_app=?, ordered_at=?, restaurant_name=?, total_amount=?, status=?, refund_amount=?, net_amount=?, items_text=?, confidence=?, review_state=?, updated_at=?
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
    next.confidence,
    next.review_state,
    next.updated_at,
    id
  );
  touchBatch(current.batch_id);
  return getOrder(id);
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
    ordersNeedingReview: orders.filter((o) => o.review_state === "needs_review").length,
    netSpend: Math.round(netSpend * 100) / 100,
    completedSpend: Math.round(completedSpend * 100) / 100,
    refundedOrCancelled: Math.round((completedSpend - netSpend) * 100) / 100
  };
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

export function getAppSettings(): AppSettings {
  const settingsRow = one<{ value_json: string }>(db.prepare("SELECT value_json FROM app_settings WHERE key=?").get(SETTINGS_KEY));
  const saved = parseJson<Partial<AppSettings>>(settingsRow?.value_json, {});
  return {
    openrouter_api_key: nonEmpty(saved.openrouter_api_key, process.env.OPENROUTER_API_KEY),
    openrouter_model: nonEmpty(saved.openrouter_model, process.env.OPENROUTER_MODEL, "google/gemini-2.0-flash-001"),
    openrouter_base_url: nonEmpty(saved.openrouter_base_url, process.env.OPENROUTER_BASE_URL, "https://openrouter.ai/api/v1"),
    paddle_python: nonEmpty(saved.paddle_python, process.env.ORDERLEDGER_PADDLE_PYTHON),
    paddle_lang: nonEmpty(saved.paddle_lang, process.env.ORDERLEDGER_PADDLE_LANG, "th"),
    paddle_timeout_ms: Number(saved.paddle_timeout_ms ?? process.env.ORDERLEDGER_PADDLE_TIMEOUT_MS ?? 90000),
    favorite_models: Array.isArray(saved.favorite_models) ? saved.favorite_models.filter(Boolean) : []
  };
}

export function saveAppSettings(patch: Partial<AppSettings>) {
  const current = getAppSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    favorite_models: Array.isArray(patch.favorite_models) ? patch.favorite_models.filter(Boolean) : current.favorite_models,
    paddle_timeout_ms: Math.max(1000, Number(patch.paddle_timeout_ms ?? current.paddle_timeout_ms) || 90000)
  };
  db.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
  `).run(SETTINGS_KEY, json(next), now());
  return next;
}
