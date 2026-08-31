import assert from "node:assert/strict";
import test from "node:test";
import { renderBatchInvoiceHtml } from "../server/pdf-template";
import type { Batch, OrderRow, PdfStyle } from "../server/types";

const batch: Batch = { id: "batch_test", title: "Test import", month: "2026-07", created_at: 0, updated_at: 0 };
const orders: OrderRow[] = [{
  id: "order_test",
  batch_id: batch.id,
  source_app: "grab",
  ordered_at: "2026-07-16T13:04:00",
  restaurant_name: "Example Kitchen",
  total_amount: 100,
  status: "completed",
  refund_amount: 0,
  net_amount: 100,
  items_text: "Rice bowl",
  review_state: "ok",
  user_edited: 0,
  duplicate_key: "test",
  source_screenshot_ids_json: "[]",
  evidence_json: "{}",
  created_at: 0,
  updated_at: 0
}];

function html(style: PdfStyle) {
  return renderBatchInvoiceHtml({
    batch,
    orders,
    summary: { netSpend: 100, ordersTotal: 1, ordersNeedingReview: 0 },
    style
  });
}

test("PDF styles render their intended information density", () => {
  assert.match(html("midnight"), /class="style-midnight"/);
  assert.match(html("midnight"), /page-break-before: always/);

  assert.match(html("minimal"), /class="style-minimal"/);
  assert.doesNotMatch(html("minimal"), /<th>Items \/ Note<\/th>/);

  assert.match(html("audit"), /class="style-audit"/);
  assert.match(html("audit"), /<th>Check<\/th>/);
});
