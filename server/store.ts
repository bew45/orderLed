import { db, now, uuid } from "./db";
import { BLOCKING_FLAG_CODES, parseFlags, serializeFlags } from "./flags";
import { deleteStoredImage } from "./image-store";
import { json, parseJson } from "./json";
import { netAmount, normalizeOrderStatus, normalizeSourceApp } from "./normalize";
import type { AmountCheck, AppSettings, Batch, BatchRollup, BatchSummary, DatePrecision, LedgerDashboard, MonthBucket, OcrRow, OrderFlag, OrderRow, PdfStyle, RestaurantTally, ReviewState, ReviewTier, Screenshot, SourceApp } from "./types";

const SOURCE_APPS: SourceApp[] = ["grab", "lineman", "shopeefood", "unknown"];

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function emptyAppMap(): Record<SourceApp, number> {
  return { grab: 0, lineman: 0, shopeefood: 0, unknown: 0 };
}

function monthKeyOf(orderedAt: string): string {
  return /^\d{4}-\d{2}/.test(orderedAt) ? orderedAt.slice(0, 7) : "unknown";
}

function topRestaurants(orders: OrderRow[], limit = 3): RestaurantTally[] {
  const map = new Map<string, RestaurantTally>();
  for (const order of orders) {
    const name = order.restaurant_name || "ไม่ทราบชื่อร้าน";
    const tally = map.get(name) ?? { name, count: 0, spend: 0 };
    tally.count += 1;
    tally.spend = round2(tally.spend + order.net_amount);
    map.set(name, tally);
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend).slice(0, limit);
}

function reviewStateForTier(tier: ReviewTier, userEdited: boolean): ReviewState {
  if (userEdited) return "corrected";
  return tier === "clean" ? "ok" : "needs_check";
}

function datePrecisionFor(orderedAt: string): DatePrecision {
  if (!orderedAt) return "none";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(orderedAt)) return "full";
  if (/^\d{4}-\d{2}$/.test(orderedAt)) return "month";
  if (/^\d{4}-\d{2}-\d{2}/.test(orderedAt)) return "full";
  return "none";
}

function one<T>(value: unknown) {
  return value as T | undefined;
}

function asMoney(value: unknown, fallback: number, label: string) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number`);
  return Math.round(number * 100) / 100;
}

export function startExtractionRun(input: { batchId: string; screenshotId: string; extractionEngine: string }) {
  const run = {
    id: uuid("run"),
    batchId: input.batchId,
    screenshotId: input.screenshotId,
    extractionEngine: input.extractionEngine,
    startedAt: now()
  };
  db.prepare(`
    INSERT INTO extraction_runs (id, batch_id, screenshot_id, extraction_engine, status, error, llm_result_json, ocr_rows_json, amount_check_json, started_at, completed_at)
    VALUES (?, ?, ?, ?, 'running', '', '{}', '[]', '{}', ?, 0)
  `).run(run.id, run.batchId, run.screenshotId, run.extractionEngine, run.startedAt);
  return run;
}

export function finishExtractionRun(input: {
  id: string;
  status: "done" | "failed" | "stopped";
  error?: string;
  llmResult?: unknown;
  ocrRows?: OcrRow[];
  amountCheck?: AmountCheck;
}) {
  db.prepare(`
    UPDATE extraction_runs SET status=?, error=?, llm_result_json=?, ocr_rows_json=?, amount_check_json=?, completed_at=?
    WHERE id=? AND status='running'
  `).run(
    input.status,
    input.error ?? "",
    json(input.llmResult),
    json(input.ocrRows ?? []),
    json(input.amountCheck),
    now(),
    input.id
  );
}

export function recordOrderObservation(input: {
  extractionRunId: string;
  batchId: string;
  screenshotId: string;
  orderId: string;
  screenOrder: number;
  raw: unknown;
  normalized: unknown;
  attentionReasons: string[];
}) {
  const observation = { id: uuid("obs"), createdAt: now() };
  db.prepare(`
    INSERT INTO order_observations (id, extraction_run_id, batch_id, screenshot_id, order_id, screen_order, raw_json, normalized_json, attention_reasons_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    observation.id,
    input.extractionRunId,
    input.batchId,
    input.screenshotId,
    input.orderId,
    input.screenOrder,
    json(input.raw),
    json(input.normalized),
    json(input.attentionReasons),
    observation.createdAt
  );
  return observation;
}

export function recordFieldEvidence(input: {
  observationId: string;
  fieldName: string;
  source: "vision" | "ocr" | "rule" | "human";
  value: unknown;
  rowIds?: string[];
  bbox?: unknown;
  confidence?: number | null;
}) {
  db.prepare(`
    INSERT INTO field_evidence (id, order_observation_id, field_name, source, value_json, row_ids_json, bbox_json, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid("evidence"),
    input.observationId,
    input.fieldName,
    input.source,
    json(input.value),
    json(input.rowIds ?? []),
    json(input.bbox ?? {}),
    input.confidence ?? null,
    now()
  );
}

function screenOrderFromEvidence(value: unknown) {
  const evidence = parseJson<{ screenOrder?: unknown }>(typeof value === "string" ? value : json(value), {});
  const screenOrder = Number(evidence.screenOrder);
  return Number.isInteger(screenOrder) && screenOrder > 0 ? screenOrder : 0;
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
  if (!getBatch(id)) return false;
  const shots = listScreenshots(id);
  const shotIds = new Set(shots.map((shot) => shot.id));
  const ts = now();

  db.exec("BEGIN");
  try {
    // The FK cascade on orders.batch_id is gone (bug B13). A ledger row that
    // another batch also observed must survive; only rows this batch was the
    // sole evidence for (and that no person owns) are removed.
    const tagged = db.prepare("SELECT * FROM orders WHERE batch_id=?").all(id) as OrderRow[];
    for (const order of tagged) {
      const remaining = parseJson<string[]>(order.source_screenshot_ids_json, []).filter((sid) => !shotIds.has(sid));
      if (remaining.length === 0 && !order.user_edited) {
        db.prepare("DELETE FROM orders WHERE id=?").run(order.id);
        continue;
      }
      const nextBatch = remaining.length
        ? one<{ batch_id: string }>(db.prepare("SELECT batch_id FROM screenshots WHERE id=?").get(remaining[0]))?.batch_id ?? ""
        : "";
      const flags = remaining.length
        ? order.flags_json
        : serializeFlags([
            ...parseFlags(order.flags_json).filter((f) => f.code !== "orphaned"),
            { code: "orphaned", field: "", severity: "warn", detail: "ต้นฉบับถูกลบ" }
          ]);
      db.prepare(
        "UPDATE orders SET source_screenshot_ids_json=?, batch_id=?, flags_json=?, updated_at=? WHERE id=?"
      ).run(json(remaining), nextBatch, flags, ts, order.id);
    }
    db.prepare("DELETE FROM batches WHERE id=?").run(id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  for (const shot of shots) deleteStoredImage(shot.storage_path);
  return true;
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
    llm_usage_json: "{}",
    llm_cost_usd: 0,
    processed_at: 0,
    error: "",
    created_at: ts,
    updated_at: ts
  };
  db.prepare(`
    INSERT INTO screenshots
      (id, batch_id, original_name, storage_path, content_hash, source_app_guess, width, height, ocr_text_json, ocr_line_count, extracted_order_count, extraction_engine, amount_check_state, amount_check_json, ocr_status, ocr_error, ocr_completed_at, llm_status, llm_error, llm_completed_at, llm_usage_json, llm_cost_usd, processed_at, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    screenshot.llm_usage_json,
    screenshot.llm_cost_usd,
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
  // A re-read refreshes machine output, never a row a person has confirmed or edited.
  // The next extractor pass will merge back into that protected row when its stable key
  // still matches, while preserving the human-owned values.
  removeScreenshotOrderReferences(id, shot.batch_id, ts, { preserveUserEdits: true });
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
      llm_usage_json='{}',
      llm_cost_usd=0,
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
  usage?: unknown;
  costUsd?: number;
}) {
  const current = getScreenshot(id);
  const ts = now();
  db.prepare(`
    UPDATE screenshots SET
      llm_status=?,
      llm_error=?,
      llm_completed_at=?,
      extraction_engine=?,
      llm_usage_json=?,
      llm_cost_usd=?,
      updated_at=?
    WHERE id=?
  `).run(
    input.status,
    input.error ?? "",
    ["done", "failed"].includes(input.status) ? ts : current?.llm_completed_at ?? 0,
    input.extractionEngine ?? current?.extraction_engine ?? "",
    input.usage ? json(input.usage) : current?.llm_usage_json ?? "{}",
    Number.isFinite(input.costUsd) ? Number(input.costUsd) : current?.llm_cost_usd ?? 0,
    ts,
    id
  );
  if (current) touchBatch(current.batch_id);
}

function removeScreenshotOrderReferences(
  screenshotId: string,
  _batchId: string,
  ts: number,
  opts: { preserveUserEdits?: boolean } = {}
) {
  // Query by evidence membership, not by batch: after global dedupe a ledger row
  // may carry evidence from screenshots in more than one batch (bug B12/B14).
  const orders = db
    .prepare("SELECT * FROM orders WHERE source_screenshot_ids_json LIKE ?")
    .all(`%${screenshotId}%`) as OrderRow[];
  for (const order of orders) {
    const ids = parseJson<string[]>(order.source_screenshot_ids_json, []);
    if (!ids.includes(screenshotId)) continue;
    if (opts.preserveUserEdits && Boolean(order.user_edited)) continue;
    const nextIds = ids.filter((sourceId) => sourceId !== screenshotId);
    if (nextIds.length > 0) {
      db.prepare("UPDATE orders SET source_screenshot_ids_json=?, updated_at=? WHERE id=?")
        .run(json(nextIds), ts, order.id);
    } else if (order.user_edited) {
      // Keep a human-owned row even with no machine evidence left; flag it.
      const flags = serializeFlags([
        ...parseFlags(order.flags_json).filter((f) => f.code !== "orphaned"),
        { code: "orphaned", field: "", severity: "warn", detail: "ต้นฉบับถูกลบ" }
      ]);
      db.prepare("UPDATE orders SET source_screenshot_ids_json='[]', flags_json=?, updated_at=? WHERE id=?")
        .run(flags, ts, order.id);
    } else {
      db.prepare("DELETE FROM orders WHERE id=?").run(order.id);
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

export type UpsertOrderInput = {
  batchId: string;
  sourceApp: SourceApp;
  orderedAt: string;
  datePrecision?: DatePrecision;
  restaurantName: string;
  branch?: string;
  totalAmount: number;
  status: string;
  refundAmount: number;
  netAmount: number;
  itemCount?: number;
  itemsText: string;
  confidence?: number;
  reviewTier?: ReviewTier;
  flags?: OrderFlag[];
  /** Back-compat: callers/tests may still pass a coarse review state. */
  reviewState?: ReviewState;
  duplicateKey: string;
  sourceScreenshotId: string;
  screenOrder?: number;
  evidence: unknown;
};

/**
 * Upsert a card into the system-wide ledger (see docs/REDESIGN_PLAN.md §5 step 2g).
 *  - global dedupe by duplicate_key, not batch-scoped (bug B12)
 *  - two identical-looking cards on ONE screenshot stay two rows (bug B11)
 *  - an extra corroborating screenshot never pushes a row to "blocked" (bug B5)
 */
export function upsertOrder(input: UpsertOrderInput) {
  const incomingTier: ReviewTier =
    input.reviewTier ?? (input.reviewState === "ok" ? "clean" : input.reviewState === "corrected" ? "clean" : "review");
  const incomingFlags: OrderFlag[] = input.flags ?? [];
  const incomingConfidence = typeof input.confidence === "number" ? input.confidence : incomingTier === "clean" ? 0.85 : 0.4;
  const datePrecision = input.datePrecision ?? datePrecisionFor(input.orderedAt);
  const branch = input.branch ?? "";
  const itemCount = Math.max(0, Math.round(input.itemCount ?? 0));
  const incomingScreenOrder = input.screenOrder || screenOrderFromEvidence(input.evidence);
  const ts = now();

  // Global dedupe (bug B12).
  let existing = one<OrderRow>(db.prepare("SELECT * FROM orders WHERE duplicate_key=?").get(input.duplicateKey));

  // Legacy fallback: a human-corrected row whose key drifted still matches its card.
  if (!existing && incomingScreenOrder) {
    const candidates = db
      .prepare("SELECT * FROM orders WHERE user_edited=1 AND source_screenshot_ids_json LIKE ?")
      .all(`%${input.sourceScreenshotId}%`) as OrderRow[];
    existing = candidates.find(
      (order) =>
        parseJson<string[]>(order.source_screenshot_ids_json, []).includes(input.sourceScreenshotId) &&
        screenOrderFromEvidence(order.evidence_json) === incomingScreenOrder
    );
  }

  // Bug B11: two cards on the SAME screenshot that share app|date|restaurant|amount
  // (e.g. a repeated Shopee order with no visible time) are two distinct orders.
  let splitFromIdenticalCard = false;
  if (existing && incomingScreenOrder) {
    const sameShot = db
      .prepare("SELECT screen_order FROM order_observations WHERE order_id=? AND screenshot_id=?")
      .all(existing.id, input.sourceScreenshotId) as Array<{ screen_order: number }>;
    if (sameShot.length > 0 && !sameShot.some((row) => row.screen_order === incomingScreenOrder)) {
      existing = undefined;
      splitFromIdenticalCard = true;
    }
  }

  if (existing) {
    const existingIds = parseJson<string[]>(existing.source_screenshot_ids_json, []);
    const ids = new Set(existingIds);
    ids.add(input.sourceScreenshotId);
    const protectedByUser = Boolean(existing.user_edited);
    const sameScreenshot = existingIds.includes(input.sourceScreenshotId);
    const existingTier = (existing.review_tier as ReviewTier) || "review";

    let tier: ReviewTier;
    let flags: OrderFlag[];
    let confidence: number;
    if (protectedByUser) {
      tier = "clean";
      flags = [];
      confidence = Math.max(existing.confidence, 0.9);
    } else if (sameScreenshot) {
      // Fresh re-read of the same card — the new assessment wins outright.
      tier = incomingTier;
      flags = incomingFlags;
      confidence = incomingConfidence;
    } else {
      // Extra corroborating screenshot. Keep the stronger read; overlap alone
      // must never escalate a row to "blocked" (bug B5).
      const incomingWins = incomingConfidence >= existing.confidence;
      const baseTier = incomingWins ? incomingTier : existingTier;
      const baseFlags = incomingWins ? incomingFlags : parseFlags(existing.flags_json);
      tier = baseTier === "blocked" ? "review" : baseTier;
      flags = baseFlags.filter((flag) => !BLOCKING_FLAG_CODES.has(flag.code));
      confidence = Math.max(existing.confidence, incomingConfidence);
    }

    const shouldReplace = !protectedByUser && completenessScore(input) >= completenessScore(existing);
    db.prepare(`
      UPDATE orders SET
        source_app=?, ordered_at=?, date_precision=?, restaurant_name=?, branch=?,
        total_amount=?, status=?, refund_amount=?, net_amount=?, item_count=?, items_text=?,
        confidence=?, review_tier=?, review_state=?, flags_json=?, user_edited=?,
        source_screenshot_ids_json=?, evidence_json=?, updated_at=?
      WHERE id=?
    `).run(
      shouldReplace ? input.sourceApp : existing.source_app,
      shouldReplace ? input.orderedAt : existing.ordered_at,
      shouldReplace ? datePrecision : existing.date_precision,
      shouldReplace ? input.restaurantName : existing.restaurant_name,
      shouldReplace ? branch : existing.branch,
      shouldReplace ? input.totalAmount : existing.total_amount,
      shouldReplace ? input.status : existing.status,
      shouldReplace ? input.refundAmount : existing.refund_amount,
      shouldReplace ? input.netAmount : existing.net_amount,
      shouldReplace ? itemCount : existing.item_count,
      shouldReplace ? input.itemsText : existing.items_text,
      confidence,
      tier,
      reviewStateForTier(tier, protectedByUser),
      serializeFlags(flags),
      protectedByUser ? 1 : 0,
      json([...ids]),
      shouldReplace ? json(input.evidence) : existing.evidence_json,
      ts,
      existing.id
    );
    return getOrder(existing.id)!;
  }

  const id = uuid("order");
  const insertKey = splitFromIdenticalCard
    ? `${input.duplicateKey}#${input.sourceScreenshotId}:${incomingScreenOrder}`
    : input.duplicateKey;
  db.prepare(`
    INSERT INTO orders
      (id, batch_id, source_app, ordered_at, date_precision, restaurant_name, branch,
       total_amount, status, refund_amount, net_amount, item_count, currency, items_text,
       confidence, review_tier, review_state, flags_json, user_edited, duplicate_key,
       source_screenshot_ids_json, evidence_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.batchId,
    input.sourceApp,
    input.orderedAt,
    datePrecision,
    input.restaurantName,
    branch,
    input.totalAmount,
    input.status,
    input.refundAmount,
    input.netAmount,
    itemCount,
    "THB",
    input.itemsText,
    incomingConfidence,
    incomingTier,
    reviewStateForTier(incomingTier, false),
    serializeFlags(incomingFlags),
    0,
    insertKey,
    json([input.sourceScreenshotId]),
    json(input.evidence),
    ts,
    ts
  );
  touchBatch(input.batchId);
  return getOrder(id)!;
}

export function getOrder(id: string) {
  return one<OrderRow>(db.prepare("SELECT * FROM orders WHERE id=?").get(id));
}

export function listOrders(batchId: string) {
  return db.prepare("SELECT * FROM orders WHERE batch_id=? ORDER BY ordered_at DESC, restaurant_name").all(batchId) as unknown as OrderRow[];
}

export function listAllOrders() {
  return db.prepare("SELECT * FROM orders ORDER BY ordered_at DESC, restaurant_name").all() as unknown as OrderRow[];
}

export function updateOrder(id: string, patch: Partial<OrderRow>) {
  const current = getOrder(id);
  if (!current) return null;
  const totalAmount = asMoney(patch.total_amount, current.total_amount, "Total amount");
  const refundAmount = Math.min(totalAmount, asMoney(patch.refund_amount, current.refund_amount, "Refund amount"));
  const status = normalizeOrderStatus(patch.status ?? current.status);
  const orderedAt = patch.ordered_at ?? current.ordered_at;
  const next = {
    ...current,
    source_app: normalizeSourceApp(patch.source_app ?? current.source_app),
    ordered_at: orderedAt,
    date_precision: patch.date_precision ?? datePrecisionFor(orderedAt),
    restaurant_name: patch.restaurant_name ?? current.restaurant_name,
    branch: patch.branch ?? current.branch,
    total_amount: totalAmount,
    status,
    refund_amount: refundAmount,
    net_amount: netAmount(status, totalAmount, refundAmount),
    item_count: patch.item_count ?? current.item_count,
    items_text: patch.items_text ?? current.items_text,
    // A person now owns this row: full confidence, no flags, tier clean (bug B15).
    confidence: 1,
    review_tier: "clean" as ReviewTier,
    review_state: "corrected" as ReviewState,
    flags_json: "[]",
    user_edited: 1 as const,
    updated_at: now()
  };
  db.prepare(`
    UPDATE orders SET source_app=?, ordered_at=?, date_precision=?, restaurant_name=?, branch=?, total_amount=?, status=?, refund_amount=?, net_amount=?, item_count=?, items_text=?, confidence=?, review_tier=?, review_state=?, flags_json=?, user_edited=?, updated_at=?
    WHERE id=?
  `).run(
    next.source_app,
    next.ordered_at,
    next.date_precision,
    next.restaurant_name,
    next.branch,
    next.total_amount,
    next.status,
    next.refund_amount,
    next.net_amount,
    next.item_count,
    next.items_text,
    next.confidence,
    next.review_tier,
    next.review_state,
    next.flags_json,
    next.user_edited,
    next.updated_at,
    id
  );
  touchBatch(current.batch_id);
  const updated = getOrder(id);
  if (updated) {
    db.prepare(`
      INSERT INTO order_corrections (id, order_id, before_json, after_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuid("correction"), id, json(current), json(updated), now());
  }
  return updated;
}

export function createManualOrder(input: {
  batchId: string;
  sourceScreenshotId: string;
  sourceApp: SourceApp | string;
  orderedAt: string;
  restaurantName: string;
  totalAmount: unknown;
  status: string;
  refundAmount: unknown;
  itemsText: string;
}) {
  const batch = getBatch(input.batchId);
  if (!batch) throw new Error("Batch not found");
  const shot = getScreenshot(input.sourceScreenshotId);
  if (!shot || shot.batch_id !== input.batchId) throw new Error("Screenshot not found");

  const ts = now();
  const totalAmount = asMoney(input.totalAmount, 0, "Total amount");
  const refundAmount = Math.min(totalAmount, asMoney(input.refundAmount, 0, "Refund amount"));
  const status = normalizeOrderStatus(input.status);
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
    source_app: normalizeSourceApp(input.sourceApp),
    ordered_at: input.orderedAt,
    date_precision: datePrecisionFor(input.orderedAt),
    restaurant_name: input.restaurantName,
    branch: "",
    total_amount: totalAmount,
    status,
    refund_amount: refundAmount,
    net_amount: netAmount(status, totalAmount, refundAmount),
    item_count: 0,
    currency: "THB",
    items_text: input.itemsText,
    confidence: 1,
    review_tier: "clean",
    review_state: "corrected",
    flags_json: "[]",
    user_edited: 1,
    duplicate_key: `manual|${input.sourceScreenshotId}|${ts}|${Math.random().toString(36).slice(2)}`,
    source_screenshot_ids_json: json([input.sourceScreenshotId]),
    evidence_json: json({ manual: true, screenOrder }),
    created_at: ts,
    updated_at: ts
  };

  db.prepare(`
    INSERT INTO orders
      (id, batch_id, source_app, ordered_at, date_precision, restaurant_name, branch, total_amount, status, refund_amount, net_amount, item_count, currency, items_text, confidence, review_tier, review_state, flags_json, user_edited, duplicate_key, source_screenshot_ids_json, evidence_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    order.id,
    order.batch_id,
    order.source_app,
    order.ordered_at,
    order.date_precision,
    order.restaurant_name,
    order.branch,
    order.total_amount,
    order.status,
    order.refund_amount,
    order.net_amount,
    order.item_count,
    order.currency,
    order.items_text,
    order.confidence,
    order.review_tier,
    order.review_state,
    order.flags_json,
    order.user_edited,
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
  // Confirmed = clean + review. Blocked rows never contribute a baht figure (D4).
  const confirmed = orders.filter((o) => (o.review_tier as ReviewTier) !== "blocked");
  const grossSpend = confirmed.reduce((sum, o) => sum + o.total_amount, 0);
  const netSpend = confirmed.reduce((sum, o) => sum + o.net_amount, 0);
  const completedSpend = confirmed
    .filter((o) => o.status === "completed")
    .reduce((sum, o) => sum + o.total_amount, 0);
  return {
    batchId,
    screenshotsTotal: shots.length,
    screenshotsProcessed: shots.filter((s) => s.processed_at > 0).length,
    screenshotsFailed: shots.filter((s) => s.error).length,
    ordersTotal: orders.length,
    ordersNeedingReview: orders.filter((o) => (o.review_tier as ReviewTier) !== "clean").length,
    ordersBlocked: orders.filter((o) => (o.review_tier as ReviewTier) === "blocked").length,
    netSpend: round2(netSpend),
    completedSpend: round2(completedSpend),
    grossSpend: round2(grossSpend),
    refundedOrCancelled: round2(grossSpend - netSpend)
  };
}

function normalizeReviewState(value: unknown): ReviewState {
  return value === "corrected" ? "corrected" : value === "ok" ? "ok" : "needs_check";
}

function isConfirmed(order: OrderRow) {
  return (order.review_tier as ReviewTier) !== "blocked";
}

function buildMonthBucket(month: string, orders: OrderRow[]): MonthBucket {
  const grossSpend = round2(orders.reduce((sum, o) => sum + o.total_amount, 0));
  const netSpend = round2(orders.reduce((sum, o) => sum + o.net_amount, 0));
  const completedSpend = round2(
    orders.filter((o) => o.status === "completed").reduce((sum, o) => sum + o.total_amount, 0)
  );
  const byAppSpend = emptyAppMap();
  const byAppCount = emptyAppMap();
  for (const order of orders) {
    const app = (SOURCE_APPS.includes(order.source_app as SourceApp) ? order.source_app : "unknown") as SourceApp;
    byAppSpend[app] = round2(byAppSpend[app] + order.net_amount);
    byAppCount[app] += 1;
  }
  const dated = orders
    .map((o) => o.ordered_at)
    .filter((value) => /^\d{4}-\d{2}/.test(value))
    .sort();
  return {
    month,
    orderCount: orders.length,
    netSpend,
    completedSpend,
    grossSpend,
    refundedOrCancelled: round2(grossSpend - netSpend),
    reviewCount: orders.filter((o) => (o.review_tier as ReviewTier) === "review").length,
    byAppSpend,
    byAppCount,
    topRestaurants: topRestaurants(orders),
    firstDate: dated[0] ?? "",
    lastDate: dated[dated.length - 1] ?? ""
  };
}

/**
 * The whole ledger, grouped by accounting period (see docs/REDESIGN_PLAN.md §5 step 5).
 * Money is confirmed-only; blocked rows surface as `blockedCount` and nothing else (D4).
 */
export function getLedgerDashboard(): LedgerDashboard {
  const all = listAllOrders();
  const confirmed = all.filter(isConfirmed);

  const byMonth = new Map<string, OrderRow[]>();
  for (const order of confirmed) {
    const key = monthKeyOf(order.ordered_at);
    const list = byMonth.get(key);
    if (list) list.push(order);
    else byMonth.set(key, [order]);
  }

  const realMonths = [...byMonth.keys()].filter((m) => m !== "unknown").sort().reverse();
  const orderedKeys = [...realMonths, ...(byMonth.has("unknown") ? ["unknown"] : [])];
  const months = orderedKeys.map((key) => buildMonthBucket(key, byMonth.get(key) ?? []));

  const byAppSpend = emptyAppMap();
  for (const order of confirmed) {
    const app = (SOURCE_APPS.includes(order.source_app as SourceApp) ? order.source_app : "unknown") as SourceApp;
    byAppSpend[app] = round2(byAppSpend[app] + order.net_amount);
  }
  const grossSpend = round2(confirmed.reduce((sum, o) => sum + o.total_amount, 0));
  const confirmedNet = round2(confirmed.reduce((sum, o) => sum + o.net_amount, 0));

  return {
    confirmedNet,
    grossSpend,
    refundedOrCancelled: round2(grossSpend - confirmedNet),
    orderCount: confirmed.length,
    blockedCount: all.length - confirmed.length,
    restaurantCount: new Set(confirmed.map((o) => o.restaurant_name).filter(Boolean)).size,
    monthCount: realMonths.length,
    byAppSpend,
    months
  };
}

export function getLedgerOrders(period?: string): OrderRow[] {
  const all = listAllOrders();
  if (!period) return all;
  return all.filter((order) => monthKeyOf(order.ordered_at) === period);
}

/** "What did this import add to the ledger" — joins through order_observations. */
export function getBatchRollup(batchId: string): BatchRollup {
  const shots = listScreenshots(batchId);
  // Orders this batch touched: any with an observation from it, plus any tagged
  // to it (covers legacy rows imported before the raw layer existed).
  const touched = db
    .prepare(
      "SELECT * FROM orders WHERE batch_id = ? " +
        "UNION SELECT o.* FROM orders o JOIN order_observations obs ON obs.order_id = o.id WHERE obs.batch_id = ?"
    )
    .all(batchId, batchId) as OrderRow[];

  const confirmed = touched.filter(isConfirmed);
  const periods = [...new Set(touched.map((o) => monthKeyOf(o.ordered_at)))].sort((a, b) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return a < b ? 1 : -1;
  });

  return {
    batchId,
    screenshotsTotal: shots.length,
    screenshotsProcessed: shots.filter((s) => s.processed_at > 0).length,
    screenshotsFailed: shots.filter((s) => s.error).length,
    newOrders: touched.filter((o) => o.batch_id === batchId).length,
    mergedOrders: touched.filter((o) => o.batch_id !== batchId).length,
    reviewCount: touched.filter((o) => (o.review_tier as ReviewTier) === "review").length,
    blockedCount: touched.filter((o) => (o.review_tier as ReviewTier) === "blocked").length,
    netPosted: round2(confirmed.reduce((sum, o) => sum + o.net_amount, 0)),
    periods
  };
}

export function listOrderObservations(orderId: string) {
  return db
    .prepare(
      "SELECT id, extraction_run_id, batch_id, screenshot_id, screen_order, raw_json, normalized_json, attention_reasons_json, created_at " +
        "FROM order_observations WHERE order_id = ? ORDER BY created_at DESC"
    )
    .all(orderId);
}

export function listScreenshotObservations(screenshotId: string) {
  return db
    .prepare(
      "SELECT id, extraction_run_id, batch_id, order_id, screen_order, raw_json, normalized_json, attention_reasons_json, created_at " +
        "FROM order_observations WHERE screenshot_id = ? ORDER BY screen_order, created_at DESC"
    )
    .all(screenshotId);
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
  const date = String(order.orderedAt ?? order.ordered_at ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) score += 2;
  else if (/^\d{4}-\d{2}$/.test(date)) score += 1;
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

function pdfStyle(value: unknown): PdfStyle {
  return value === "minimal" || value === "audit" || value === "midnight" ? value : "midnight";
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
    promptpay_recipient_name: nonEmpty(saved.promptpay_recipient_name, process.env.ORDERLEDGER_PROMPTPAY_RECIPIENT_NAME),
    pdf_style: pdfStyle(saved.pdf_style)
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
    promptpay_recipient_name: patch.promptpay_recipient_name !== undefined ? String(patch.promptpay_recipient_name).trim() : current.promptpay_recipient_name,
    pdf_style: patch.pdf_style !== undefined ? pdfStyle(patch.pdf_style) : current.pdf_style
  };
  db.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
  `).run(SETTINGS_KEY, json(next), now());
  return next;
}
