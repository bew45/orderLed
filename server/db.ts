import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { join, resolve } from "path";
import { DatabaseSync } from "node:sqlite";

// Tests and recovery tooling can point at an isolated database without ever
// touching the user's local ledger. Production continues to use ./data.
export const DATA_DIR = process.env.ORDERLEDGER_DATA_DIR
  ? resolve(process.env.ORDERLEDGER_DATA_DIR)
  : join(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, "orderledger.db"));

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 10000");

export function now() {
  return Date.now();
}

export function uuid(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    month TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_batches_month_updated
    ON batches(month, updated_at DESC);

  CREATE TABLE IF NOT EXISTS screenshots (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    source_app_guess TEXT NOT NULL DEFAULT 'unknown',
    width INTEGER NOT NULL DEFAULT 0,
    height INTEGER NOT NULL DEFAULT 0,
    processed_at INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_screenshots_batch_hash
    ON screenshots(batch_id, content_hash);

  CREATE INDEX IF NOT EXISTS idx_screenshots_batch
    ON screenshots(batch_id, created_at);

  -- System-wide ledger (see docs/REDESIGN_PLAN.md). batch_id is a plain
  -- "first seen in" tag, NOT a cascading FK: deleting a batch must never delete
  -- a ledger row another batch also observed. Provenance lives in
  -- order_observations. Existing DBs are upgraded by migrateOrdersLedgerV2().
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL DEFAULT '',
    source_app TEXT NOT NULL DEFAULT 'unknown',
    ordered_at TEXT NOT NULL DEFAULT '',
    date_precision TEXT NOT NULL DEFAULT 'full',
    restaurant_name TEXT NOT NULL DEFAULT '',
    branch TEXT NOT NULL DEFAULT '',
    total_amount REAL NOT NULL DEFAULT 0,
    refund_amount REAL NOT NULL DEFAULT 0,
    net_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unknown',
    item_count INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'THB',
    confidence REAL NOT NULL DEFAULT 0,
    review_tier TEXT NOT NULL DEFAULT 'review',
    review_state TEXT NOT NULL DEFAULT 'needs_check',
    flags_json TEXT NOT NULL DEFAULT '[]',
    items_text TEXT NOT NULL DEFAULT '',
    user_edited INTEGER NOT NULL DEFAULT 0,
    duplicate_key TEXT NOT NULL DEFAULT '',
    source_screenshot_ids_json TEXT NOT NULL DEFAULT '[]',
    evidence_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_orders_batch_date
    ON orders(batch_id, ordered_at);

  CREATE INDEX IF NOT EXISTS idx_orders_ordered_at
    ON orders(ordered_at);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_duplicate
    ON orders(duplicate_key)
    WHERE duplicate_key <> ''
      AND duplicate_key NOT LIKE 'unresolved|%'
      AND duplicate_key NOT LIKE 'manual|%';

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS extraction_runs (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    screenshot_id TEXT NOT NULL,
    extraction_engine TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'running',
    error TEXT NOT NULL DEFAULT '',
    llm_result_json TEXT NOT NULL DEFAULT '{}',
    ocr_rows_json TEXT NOT NULL DEFAULT '[]',
    amount_check_json TEXT NOT NULL DEFAULT '{}',
    started_at INTEGER NOT NULL,
    completed_at INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    FOREIGN KEY (screenshot_id) REFERENCES screenshots(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_extraction_runs_screenshot
    ON extraction_runs(screenshot_id, started_at DESC);

  CREATE TABLE IF NOT EXISTS order_observations (
    id TEXT PRIMARY KEY,
    extraction_run_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    screenshot_id TEXT NOT NULL,
    order_id TEXT,
    screen_order INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT NOT NULL DEFAULT '{}',
    normalized_json TEXT NOT NULL DEFAULT '{}',
    attention_reasons_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (extraction_run_id) REFERENCES extraction_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    FOREIGN KEY (screenshot_id) REFERENCES screenshots(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_order_observations_order
    ON order_observations(order_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS field_evidence (
    id TEXT PRIMARY KEY,
    order_observation_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    source TEXT NOT NULL,
    value_json TEXT NOT NULL DEFAULT '{}',
    row_ids_json TEXT NOT NULL DEFAULT '[]',
    bbox_json TEXT NOT NULL DEFAULT '{}',
    confidence REAL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (order_observation_id) REFERENCES order_observations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_field_evidence_observation
    ON field_evidence(order_observation_id, field_name);

  CREATE TABLE IF NOT EXISTS order_corrections (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_order_corrections_order
    ON order_corrections(order_id, created_at DESC);
`);

function columnExists(table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing("screenshots", "ocr_text_json", "TEXT NOT NULL DEFAULT '[]'");
addColumnIfMissing("screenshots", "ocr_line_count", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("screenshots", "extracted_order_count", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("screenshots", "extraction_engine", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("screenshots", "amount_check_state", "TEXT NOT NULL DEFAULT 'not_checked'");
addColumnIfMissing("screenshots", "amount_check_json", "TEXT NOT NULL DEFAULT '{}'");
addColumnIfMissing("screenshots", "ocr_status", "TEXT NOT NULL DEFAULT 'not_started'");
addColumnIfMissing("screenshots", "ocr_error", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("screenshots", "ocr_completed_at", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("screenshots", "llm_status", "TEXT NOT NULL DEFAULT 'not_started'");
addColumnIfMissing("screenshots", "llm_error", "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing("screenshots", "llm_completed_at", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("screenshots", "llm_usage_json", "TEXT NOT NULL DEFAULT '{}'");
addColumnIfMissing("screenshots", "llm_cost_usd", "REAL NOT NULL DEFAULT 0");
addColumnIfMissing("orders", "user_edited", "INTEGER NOT NULL DEFAULT 0");

db.prepare("UPDATE orders SET review_state='needs_check' WHERE review_state='needs_review'").run();

/**
 * Ledger v2 migration (see docs/REDESIGN_PLAN.md P1.1).
 *
 * Turns `orders` from a batch-scoped table into a system-wide ledger:
 *  - drop `ON DELETE CASCADE` on batch_id so deleting a batch never deletes a
 *    ledger row another batch also observed (bug B13). `batch_id` stays as a
 *    plain "first seen in" tag; real provenance lives in `order_observations`.
 *  - replace UNIQUE(batch_id, duplicate_key) with a global partial UNIQUE on
 *    duplicate_key (bug B12), excluding weak `unresolved|` / `manual|` keys.
 *  - add ledger columns: date_precision, branch, item_count, currency,
 *    confidence, review_tier, flags_json. `review_state` is kept and derived
 *    from review_tier for backward-compatible UI until Phase 2.
 *
 * Idempotent: detected by the presence of the `review_tier` column.
 */
function migrateOrdersLedgerV2() {
  if (columnExists("orders", "review_tier")) return;

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    // Collapse rows that share a strong duplicate_key across batches so the new
    // global UNIQUE index can be created. Keep the human-edited / oldest row,
    // fold the others' screenshot ids in, and repoint their raw-layer rows.
    const dupKeys = db.prepare(`
      SELECT duplicate_key FROM orders
      WHERE duplicate_key <> ''
        AND duplicate_key NOT LIKE 'unresolved|%'
        AND duplicate_key NOT LIKE 'manual|%'
      GROUP BY duplicate_key HAVING COUNT(*) > 1
    `).all() as Array<{ duplicate_key: string }>;
    for (const { duplicate_key } of dupKeys) {
      const rows = db.prepare(
        "SELECT id, source_screenshot_ids_json FROM orders WHERE duplicate_key=? ORDER BY user_edited DESC, created_at ASC, id ASC"
      ).all(duplicate_key) as Array<{ id: string; source_screenshot_ids_json: string }>;
      const keep = rows[0];
      const ids = new Set<string>();
      for (const row of rows) {
        try {
          for (const id of JSON.parse(row.source_screenshot_ids_json || "[]")) ids.add(String(id));
        } catch {
          /* ignore malformed json */
        }
      }
      db.prepare("UPDATE orders SET source_screenshot_ids_json=? WHERE id=?").run(JSON.stringify([...ids]), keep.id);
      for (const row of rows.slice(1)) {
        db.prepare("UPDATE order_observations SET order_id=? WHERE order_id=?").run(keep.id, row.id);
        db.prepare("UPDATE order_corrections SET order_id=? WHERE order_id=?").run(keep.id, row.id);
        db.prepare("DELETE FROM orders WHERE id=?").run(row.id);
      }
    }

    db.exec(`
      CREATE TABLE orders_v2 (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL DEFAULT '',
        source_app TEXT NOT NULL DEFAULT 'unknown',
        ordered_at TEXT NOT NULL DEFAULT '',
        date_precision TEXT NOT NULL DEFAULT 'full',
        restaurant_name TEXT NOT NULL DEFAULT '',
        branch TEXT NOT NULL DEFAULT '',
        total_amount REAL NOT NULL DEFAULT 0,
        refund_amount REAL NOT NULL DEFAULT 0,
        net_amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unknown',
        item_count INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'THB',
        confidence REAL NOT NULL DEFAULT 0,
        review_tier TEXT NOT NULL DEFAULT 'review',
        review_state TEXT NOT NULL DEFAULT 'needs_check',
        flags_json TEXT NOT NULL DEFAULT '[]',
        items_text TEXT NOT NULL DEFAULT '',
        user_edited INTEGER NOT NULL DEFAULT 0,
        duplicate_key TEXT NOT NULL DEFAULT '',
        source_screenshot_ids_json TEXT NOT NULL DEFAULT '[]',
        evidence_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO orders_v2 (
        id, batch_id, source_app, ordered_at, date_precision, restaurant_name, branch,
        total_amount, refund_amount, net_amount, status, item_count, currency, confidence,
        review_tier, review_state, flags_json, items_text, user_edited, duplicate_key,
        source_screenshot_ids_json, evidence_json, created_at, updated_at
      )
      SELECT
        id, batch_id, source_app, ordered_at,
        CASE
          WHEN ordered_at LIKE '____-__-__T__:__%' THEN 'full'
          WHEN ordered_at LIKE '____-__' THEN 'month'
          WHEN ordered_at = '' THEN 'none'
          ELSE 'full'
        END,
        restaurant_name, '',
        total_amount, refund_amount, net_amount, status, 0, 'THB',
        CASE review_state WHEN 'corrected' THEN 1.0 WHEN 'ok' THEN 0.85 ELSE 0.4 END,
        CASE review_state WHEN 'needs_check' THEN 'review' ELSE 'clean' END,
        review_state, '[]', items_text, user_edited, duplicate_key,
        source_screenshot_ids_json, evidence_json, created_at, updated_at
      FROM orders;

      DROP TABLE orders;
      ALTER TABLE orders_v2 RENAME TO orders;

      CREATE INDEX IF NOT EXISTS idx_orders_batch_date ON orders(batch_id, ordered_at);
      CREATE INDEX IF NOT EXISTS idx_orders_ordered_at ON orders(ordered_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_duplicate ON orders(duplicate_key)
        WHERE duplicate_key <> ''
          AND duplicate_key NOT LIKE 'unresolved|%'
          AND duplicate_key NOT LIKE 'manual|%';
    `);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.exec("PRAGMA foreign_keys = ON");
    throw error;
  }
  db.exec("PRAGMA foreign_keys = ON");
}

migrateOrdersLedgerV2();
