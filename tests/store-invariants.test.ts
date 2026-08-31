import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const testDataDir = mkdtempSync(join(tmpdir(), "orderledger-store-test-"));
process.env.ORDERLEDGER_DATA_DIR = testDataDir;
let closeDatabase: (() => void) | undefined;

test("re-reading a screenshot never deletes a human-confirmed row and server derives net amount", async () => {
  const store = await import("../server/store");
  const database = await import("../server/db");
  closeDatabase = () => database.db.close();
  const batch = store.createBatch({ title: "Invariant test", month: "2026-07" });
  const screenshot = store.addScreenshot({
    batchId: batch.id,
    originalName: "screen.png",
    storagePath: "data/uploads/test/screen.png",
    contentHash: "test-hash",
    sourceAppGuess: "grab",
    width: 100,
    height: 200
  });
  const order = store.upsertOrder({
    batchId: batch.id,
    sourceScreenshotId: screenshot.id,
    sourceApp: "grab",
    orderedAt: "2026-07-16T13:04:00",
    restaurantName: "Example Kitchen",
    totalAmount: 140,
    refundAmount: 0,
    netAmount: 140,
    status: "completed",
    itemsText: "Rice bowl",
    reviewState: "ok",
    duplicateKey: "grab|2026-07-16T13:04|examplekitchen|140.00",
    evidence: { screenOrder: 1 }
  });
  assert.equal(order.user_edited, 0);

  const run = store.startExtractionRun({ batchId: batch.id, screenshotId: screenshot.id, extractionEngine: "test:vision" });
  const observation = store.recordOrderObservation({
    extractionRunId: run.id,
    batchId: batch.id,
    screenshotId: screenshot.id,
    orderId: order.id,
    screenOrder: 1,
    raw: { totalAmount: 140 },
    normalized: { totalAmount: 140 },
    attentionReasons: []
  });
  store.recordFieldEvidence({ observationId: observation.id, fieldName: "totalAmount", source: "vision", value: 140 });
  store.finishExtractionRun({ id: run.id, status: "done", llmResult: { orders: 1 } });
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM order_observations").get()?.count, 1);
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM field_evidence").get()?.count, 1);

  const updated = store.updateOrder(order.id, {
    total_amount: 140,
    refund_amount: 80,
    status: "refunded",
    net_amount: 99999
  });
  assert.equal(updated?.net_amount, 60);
  assert.equal(updated?.user_edited, 1);
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM order_corrections").get()?.count, 1);

  store.clearScreenshotExtraction(screenshot.id);
  const preserved = store.getOrder(order.id);
  assert.ok(preserved);
  assert.equal(preserved?.net_amount, 60);
  assert.equal(preserved?.user_edited, 1);
  assert.match(preserved?.source_screenshot_ids_json || "", new RegExp(screenshot.id));

  const refreshed = store.upsertOrder({
    batchId: batch.id,
    sourceScreenshotId: screenshot.id,
    sourceApp: "grab",
    orderedAt: "2026-07-16T13:04:00",
    restaurantName: "Example Kitchen",
    totalAmount: 140,
    refundAmount: 0,
    netAmount: 140,
    status: "completed",
    itemsText: "Rice bowl",
    reviewState: "ok",
    duplicateKey: `unresolved|${screenshot.id}|1`,
    evidence: { screenOrder: 1 }
  });
  assert.equal(refreshed.id, order.id);
  assert.equal(store.listOrders(batch.id).length, 1);
});

test.after(() => {
  closeDatabase?.();
  rmSync(testDataDir, { recursive: true, force: true });
});
