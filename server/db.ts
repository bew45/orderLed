import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { join } from "path";
import { DatabaseSync } from "node:sqlite";

export const DATA_DIR = join(process.cwd(), "data");
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

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    source_app TEXT NOT NULL DEFAULT 'unknown',
    ordered_at TEXT NOT NULL DEFAULT '',
    restaurant_name TEXT NOT NULL DEFAULT '',
    total_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unknown',
    refund_amount REAL NOT NULL DEFAULT 0,
    net_amount REAL NOT NULL DEFAULT 0,
    items_text TEXT NOT NULL DEFAULT '',
    review_state TEXT NOT NULL DEFAULT 'needs_check',
    duplicate_key TEXT NOT NULL DEFAULT '',
    source_screenshot_ids_json TEXT NOT NULL DEFAULT '[]',
    evidence_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_orders_batch_date
    ON orders(batch_id, ordered_at);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_batch_duplicate
    ON orders(batch_id, duplicate_key);

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
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

db.prepare("UPDATE orders SET review_state='needs_check' WHERE review_state='needs_review'").run();
