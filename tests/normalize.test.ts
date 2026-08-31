import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExtractedOrder, normalizeOrderedAt } from "../server/normalize";

test("normalizes Thai Buddhist Era dates to Gregorian ISO datetimes", () => {
  assert.equal(normalizeOrderedAt("16 ก.ค. 2569 13:04"), "2026-07-16T13:04:00");
});

test("an unreadable date yields no date and precision none (no batch-month fallback, bug B6)", () => {
  const order = normalizeExtractedOrder(
    {
      sourceApp: "grab",
      orderedAt: "31 Apr 2026 12:10",
      restaurantName: "Example Kitchen",
      totalAmount: 100,
      status: "completed"
    },
    { sourceApp: "grab", uniqueSeed: "shot_a|1" }
  );

  assert.equal(order.orderedAt, "");
  assert.equal(order.datePrecision, "none");
  assert.ok(order.attentionReasons.includes("date_missing"));
  assert.equal(order.duplicateKey, "unresolved|shot_a|1");
});

test("relative date text is refused, never guessed (D5)", () => {
  const order = normalizeExtractedOrder(
    {
      sourceApp: "lineman",
      orderedAtText: "Yesterday, 18:30",
      restaurantName: "Some Diner",
      totalAmount: 220,
      status: "completed"
    },
    { sourceApp: "lineman", uniqueSeed: "shot_x|2" }
  );

  assert.equal(order.orderedAt, "");
  assert.equal(order.datePrecision, "none");
  assert.ok(order.attentionReasons.includes("date_relative"));
});

test("keeps weak identities separate across screenshots", () => {
  const common = {
    sourceApp: "unknown" as const,
    orderedAt: "",
    restaurantName: "",
    totalAmount: 145,
    status: "unknown" as const
  };
  const first = normalizeExtractedOrder(common, { sourceApp: "unknown", uniqueSeed: "shot_a|1" });
  const second = normalizeExtractedOrder(common, { sourceApp: "unknown", uniqueSeed: "shot_b|1" });

  assert.notEqual(first.duplicateKey, second.duplicateKey);
  assert.ok(first.attentionReasons.includes("source_app_unknown"));
  assert.ok(first.attentionReasons.includes("restaurant_unreadable"));
  assert.ok(first.attentionReasons.includes("status_unknown"));
});

test("carries the new ledger fields through (branch, itemCount, amount text)", () => {
  const order = normalizeExtractedOrder(
    {
      sourceApp: "shopeefood",
      orderedAtText: "30 ส.ค. 2026",
      restaurantName: "Took Lae Dee",
      branch: "ลาดพร้าว",
      totalAmountText: "฿216.00",
      totalAmount: 216,
      itemCount: 3,
      status: "completed"
    },
    { sourceApp: "shopeefood", uniqueSeed: "shot_s|1" }
  );

  assert.equal(order.datePrecision, "full");
  assert.equal(order.orderedAt, "2026-08-30T00:00:00");
  assert.equal(order.branch, "ลาดพร้าว");
  assert.equal(order.itemCount, 3);
  assert.equal(order.totalAmountText, "฿216.00");
  assert.equal(order.duplicateKey, "shopeefood|2026-08-30T00:00|tooklaedee|216.00");
});
