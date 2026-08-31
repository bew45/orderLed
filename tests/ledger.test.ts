import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { beforeEach } from "node:test";

const testDataDir = mkdtempSync(join(tmpdir(), "orderledger-ledger-test-"));
process.env.ORDERLEDGER_DATA_DIR = testDataDir;

const store = await import("../server/store");
const { db } = await import("../server/db");

beforeEach(() => {
  db.exec(
    "DELETE FROM field_evidence; DELETE FROM order_observations; DELETE FROM extraction_runs; " +
      "DELETE FROM order_corrections; DELETE FROM orders; DELETE FROM screenshots; DELETE FROM batches;"
  );
});

function seedScreenshot(batchId: string, hash: string) {
  return store.addScreenshot({
    batchId,
    originalName: `${hash}.png`,
    storagePath: `data/uploads/test/${hash}.png`,
    contentHash: hash,
    sourceAppGuess: "shopeefood",
    width: 1000,
    height: 2000
  });
}

const KEY = "shopeefood|2026-07-08T00:00|tooklaedee|183.00";

function card(batchId: string, screenshotId: string, screenOrder: number, over: Record<string, unknown> = {}) {
  return {
    batchId,
    sourceApp: "shopeefood" as const,
    orderedAt: "2026-07-08T00:00:00",
    datePrecision: "full" as const,
    restaurantName: "Took Lae Dee",
    branch: "",
    totalAmount: 183,
    status: "completed",
    refundAmount: 0,
    netAmount: 183,
    itemCount: 1,
    itemsText: "",
    confidence: 0.9,
    reviewTier: "clean" as const,
    flags: [],
    duplicateKey: KEY,
    sourceScreenshotId: screenshotId,
    screenOrder,
    evidence: { screenOrder },
    ...over
  };
}

test("the same order across two batches stays one ledger row (bug B12, idempotent)", () => {
  const batchA = store.createBatch({ title: "A", month: "2026-07" });
  const shotA = seedScreenshot(batchA.id, "hash-a");
  const first = store.upsertOrder(card(batchA.id, shotA.id, 1));

  const batchB = store.createBatch({ title: "B", month: "2026-07" });
  const shotB = seedScreenshot(batchB.id, "hash-b");
  const second = store.upsertOrder(card(batchB.id, shotB.id, 1));

  assert.equal(second.id, first.id);
  assert.equal(store.listAllOrders().length, 1);
  const ids = JSON.parse(store.getOrder(first.id)!.source_screenshot_ids_json);
  assert.deepEqual([...ids].sort(), [shotA.id, shotB.id].sort());
});

test("two identical-looking cards on ONE screenshot are two ledger rows (bug B11)", () => {
  const batch = store.createBatch({ title: "C", month: "2026-07" });
  const shot = seedScreenshot(batch.id, "hash-c");

  const run = store.startExtractionRun({ batchId: batch.id, screenshotId: shot.id, extractionEngine: "test" });
  const o1 = store.upsertOrder(card(batch.id, shot.id, 1));
  store.recordOrderObservation({
    extractionRunId: run.id,
    batchId: batch.id,
    screenshotId: shot.id,
    orderId: o1.id,
    screenOrder: 1,
    raw: {},
    normalized: {},
    attentionReasons: []
  });
  const o2 = store.upsertOrder(card(batch.id, shot.id, 2));

  assert.notEqual(o2.id, o1.id);
  assert.equal(store.listOrders(batch.id).length, 2);
});

test("an extra corroborating screenshot never escalates a row to blocked (bug B5)", () => {
  const batchA = store.createBatch({ title: "D", month: "2026-07" });
  const shotA = seedScreenshot(batchA.id, "hash-d1");
  store.upsertOrder(card(batchA.id, shotA.id, 1));

  const batchB = store.createBatch({ title: "E", month: "2026-07" });
  const shotB = seedScreenshot(batchB.id, "hash-d2");
  const merged = store.upsertOrder(
    card(batchB.id, shotB.id, 1, {
      reviewTier: "blocked",
      confidence: 0.2,
      flags: [{ code: "amount_missing", field: "total_amount", severity: "block" }]
    })
  );

  assert.notEqual(merged.review_tier, "blocked");
  assert.equal(store.listAllOrders().length, 1);
});

test("deleting a batch keeps a ledger row another batch also observed (bug B13)", () => {
  const batchA = store.createBatch({ title: "F", month: "2026-07" });
  const shotA = seedScreenshot(batchA.id, "hash-f1");
  const order = store.upsertOrder(card(batchA.id, shotA.id, 1));

  const batchB = store.createBatch({ title: "G", month: "2026-07" });
  const shotB = seedScreenshot(batchB.id, "hash-f2");
  store.upsertOrder(card(batchB.id, shotB.id, 1));

  assert.equal(store.deleteBatch(batchA.id), true);
  const survivor = store.getOrder(order.id);
  assert.ok(survivor, "order should still exist");
  assert.equal(survivor!.batch_id, batchB.id);
  assert.deepEqual(JSON.parse(survivor!.source_screenshot_ids_json), [shotB.id]);
});

test("blocked rows never contribute a baht figure; cancelled money is visible (bugs B4, B9, D4)", () => {
  const batch = store.createBatch({ title: "H", month: "2026-07" });
  const shot = seedScreenshot(batch.id, "hash-h");

  store.upsertOrder(card(batch.id, shot.id, 1, { duplicateKey: "k-clean" }));
  store.upsertOrder(card(batch.id, shot.id, 2, { duplicateKey: "k-cancel", status: "cancelled", netAmount: 0 }));
  store.upsertOrder(
    card(batch.id, shot.id, 3, {
      duplicateKey: "k-blocked",
      totalAmount: 0,
      netAmount: 0,
      reviewTier: "blocked",
      confidence: 0,
      flags: [{ code: "amount_missing", field: "total_amount", severity: "block" }]
    })
  );

  const summary = store.getBatchSummary(batch.id);
  assert.equal(summary.ordersTotal, 3);
  assert.equal(summary.ordersBlocked, 1);
  assert.equal(summary.grossSpend, 366);
  assert.equal(summary.netSpend, 183);
  assert.equal(summary.refundedOrCancelled, 183);
});

test("ledger dashboard groups by month; Σ month net === confirmedNet; unknown bucket is last", () => {
  const batch = store.createBatch({ title: "I", month: "2026-07" });
  const shot = seedScreenshot(batch.id, "hash-i");

  store.upsertOrder(card(batch.id, shot.id, 1, { duplicateKey: "k1", orderedAt: "2026-07-08T00:00:00" }));
  store.upsertOrder(card(batch.id, shot.id, 2, { duplicateKey: "k2", orderedAt: "2026-06-20T12:00:00", netAmount: 100, totalAmount: 100 }));
  store.upsertOrder(card(batch.id, shot.id, 3, { duplicateKey: "k3", orderedAt: "2026-06-01T12:00:00", netAmount: 50, totalAmount: 50 }));
  // month-only precision still buckets by month
  store.upsertOrder(card(batch.id, shot.id, 4, { duplicateKey: "k4", orderedAt: "2026-05", datePrecision: "month", netAmount: 40, totalAmount: 40 }));
  // no date → unknown bucket
  store.upsertOrder(card(batch.id, shot.id, 5, { duplicateKey: "unresolved|x|5", orderedAt: "", datePrecision: "none", netAmount: 30, totalAmount: 30 }));
  // blocked → excluded from every total
  store.upsertOrder(card(batch.id, shot.id, 6, {
    duplicateKey: "k6", orderedAt: "2026-07-09T00:00:00", totalAmount: 0, netAmount: 0,
    reviewTier: "blocked", confidence: 0, flags: [{ code: "amount_missing", field: "total_amount", severity: "block" }]
  }));

  const dash = store.getLedgerDashboard();
  assert.equal(dash.blockedCount, 1);
  assert.equal(dash.orderCount, 5);
  assert.equal(dash.monthCount, 3); // 2026-07, 2026-06 (k2+k3), 2026-05 — unknown excluded
  assert.equal(dash.months.length, 4); // 3 real + unknown
  assert.equal(dash.months[dash.months.length - 1].month, "unknown");
  assert.equal(dash.months[0].month, "2026-07"); // newest first

  const sumMonths = dash.months.reduce((s, m) => s + m.netSpend, 0);
  assert.equal(Math.round(sumMonths * 100) / 100, dash.confirmedNet);
  assert.equal(dash.confirmedNet, 183 + 100 + 50 + 40 + 30);
});

test("batch rollup reports what an import posted", () => {
  const batch = store.createBatch({ title: "J", month: "2026-07" });
  const shot = seedScreenshot(batch.id, "hash-j");
  const run = store.startExtractionRun({ batchId: batch.id, screenshotId: shot.id, extractionEngine: "test" });
  const o = store.upsertOrder(card(batch.id, shot.id, 1, { duplicateKey: "jk1" }));
  store.recordOrderObservation({
    extractionRunId: run.id, batchId: batch.id, screenshotId: shot.id,
    orderId: o.id, screenOrder: 1, raw: {}, normalized: {}, attentionReasons: []
  });

  const rollup = store.getBatchRollup(batch.id);
  assert.equal(rollup.newOrders, 1);
  assert.equal(rollup.mergedOrders, 0);
  assert.equal(rollup.netPosted, 183);
  assert.deepEqual(rollup.periods, ["2026-07"]);
});

test.after(() => {
  db.close();
  rmSync(testDataDir, { recursive: true, force: true });
});
