import type { Batch, BatchSummary, OrderRow, SourceApp } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const APP_META: Record<SourceApp, { label: string; glyph: string; color: string; bg: string }> = {
  grab: { label: "Grab", glyph: "G", color: "#00994D", bg: "#E3F6EA" },
  lineman: { label: "LINE MAN", glyph: "M", color: "#06A24E", bg: "#E1F7EA" },
  shopeefood: { label: "ShopeeFood", glyph: "S", color: "#E8491D", bg: "#FCE7E0" },
  unknown: { label: "Unknown", glyph: "?", color: "#7C847D", bg: "#EEF1EE" }
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "#1F8A4C" },
  cancelled: { label: "Cancelled", color: "#B23B2E" },
  refunded: { label: "Refunded", color: "#B07A12" },
  unknown: { label: "Unknown", color: "#7C847D" }
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

function fmtDateTime(iso: string) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return escapeHtml(iso || "-");
  const [, y, mo, d, h, mi] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1] || mo} ${y}, ${h}:${mi}`;
}

function fmtDate(value: string) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return escapeHtml(value || "-");
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1] || mo} ${y}`;
}

function batchCode(batchId: string) {
  const raw = batchId.replace(/^batch_/, "").replace(/-/g, "");
  return `BATCH-${raw.slice(0, 8).toUpperCase()}`;
}

function appBadge(app: SourceApp, count?: number) {
  const meta = APP_META[app] || APP_META.unknown;
  return `
    <span class="app-badge">
      <span class="app-glyph" style="background:${meta.color}">${escapeHtml(meta.glyph)}</span>
      <span class="app-badge-label">${escapeHtml(meta.label)}${count !== undefined ? ` &middot; ${count}` : ""}</span>
    </span>`;
}

export function renderBatchInvoiceHtml(input: {
  batch: Batch;
  orders: OrderRow[];
  summary: Pick<BatchSummary, "netSpend" | "ordersTotal" | "ordersNeedingReview">;
  month?: string;
  promptPayQr?: {
    qrDataUrl: string;
    id: string;
    recipientName?: string;
  };
}) {
  const { batch, orders, summary, month, promptPayQr } = input;

  const appCounts = new Map<SourceApp, number>();
  for (const order of orders) {
    appCounts.set(order.source_app, (appCounts.get(order.source_app) ?? 0) + 1);
  }
  const appRows = [...appCounts.entries()].sort((a, b) => b[1] - a[1]);

  const restaurantTotals = new Map<string, { count: number; total: number }>();
  for (const order of orders) {
    const key = order.restaurant_name || "Unknown restaurant";
    const row = restaurantTotals.get(key) ?? { count: 0, total: 0 };
    row.count += 1;
    row.total += order.net_amount;
    restaurantTotals.set(key, row);
  }
  const topRestaurants = [...restaurantTotals.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  const restaurantCount = restaurantTotals.size;
  const grossTotal = orders.reduce((sum, order) => sum + order.total_amount, 0);
  const refundedTotal = orders.reduce((sum, order) => sum + order.refund_amount, 0);
  const netTotal = summary.netSpend;
  const avgPerOrder = summary.ordersTotal > 0 ? netTotal / summary.ordersTotal : 0;

  const orderedDates = orders.map((order) => order.ordered_at).filter(Boolean).sort();
  const reportingPeriod = month
    ? month
    : orderedDates.length > 0
      ? `${fmtDate(orderedDates[0])} - ${fmtDate(orderedDates[orderedDates.length - 1])}`
      : batch.month;

  const needsReview = summary.ordersNeedingReview > 0;

  const orderRowsHtml = orders.map((order, index) => {
    const meta = APP_META[order.source_app] || APP_META.unknown;
    const status = STATUS_META[order.status] || STATUS_META.unknown;
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td class="nowrap">${fmtDateTime(order.ordered_at)}</td>
        <td><span class="app-glyph sm" style="background:${meta.color}">${escapeHtml(meta.glyph)}</span></td>
        <td>${escapeHtml(order.restaurant_name || "Unknown restaurant")}</td>
        <td class="items">${escapeHtml(order.items_text || "-")}</td>
        <td class="nowrap" style="color:${status.color}">${escapeHtml(status.label)}</td>
        <td class="num money">${money(order.net_amount)}</td>
      </tr>`;
  }).join("\n");

  const restaurantRowsHtml = topRestaurants.map(([name, row], index) => `
    <tr>
      <td class="num">${index + 1}</td>
      <td>${escapeHtml(name)}</td>
      <td class="num">${row.count}</td>
      <td class="num money">${money(row.total)}</td>
    </tr>`).join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 26px 30px; }
  * { box-sizing: border-box; }
  body {
    font-family: "Tahoma", "Leelawadee UI", "Segoe UI", Arial, sans-serif;
    color: #16211B;
    font-size: 11px;
    margin: 0;
  }
  .sheet { padding: 4px; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 14px;
    border-bottom: 2px solid #16211B;
    margin-bottom: 14px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-mark {
    width: 40px; height: 40px; border-radius: 10px;
    background: #1F6F4F;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 18px; font-weight: 700;
  }
  .brand-name { font-size: 17px; font-weight: 800; color: #1F6F4F; letter-spacing: 0.04em; }
  .brand-sub { font-size: 10px; color: #6B776E; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 24px; font-weight: 800; }
  .doc-title p { margin: 2px 0 0; font-size: 10px; color: #6B776E; }

  .info-grid {
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 12px;
    border: 1px solid #E1E7E2;
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 14px;
    background: #FAFBFA;
  }
  .info-rows { display: grid; gap: 6px; align-content: start; }
  .info-row { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; }
  .info-row span:first-child { color: #6B776E; }
  .info-row span:last-child { font-weight: 700; text-align: right; }
  .info-side { display: grid; gap: 8px; align-content: start; border-left: 1px solid #E1E7E2; padding-left: 14px; }
  .info-side-label { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #6B776E; }
  .app-badge-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .app-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px 3px 3px; border-radius: 999px; background: #fff; border: 1px solid #E1E7E2; }
  .app-badge-label { font-size: 10px; font-weight: 600; }
  .app-glyph { width: 16px; height: 16px; border-radius: 5px; color: #fff; font-size: 9px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
  .app-glyph.sm { width: 15px; height: 15px; font-size: 8px; border-radius: 4px; }
  .status-pill { display: inline-flex; width: fit-content; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; }
  .status-pill.ok { background: #E3F6EA; color: #1F8A4C; }
  .status-pill.warn { background: #FCEFDA; color: #B07A12; }

  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .stat-card { border: 1px solid #E1E7E2; border-radius: 10px; padding: 10px 12px; background: #fff; }
  .stat-label { font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #6B776E; }
  .stat-value { display: block; margin-top: 3px; font-size: 15px; font-weight: 800; }

  h2.section-title { font-size: 12px; font-weight: 800; margin: 0 0 8px; }

  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .order-table th, .order-table td { border-bottom: 1px solid #EAEEEA; padding: 6px 7px; text-align: left; font-size: 10.5px; vertical-align: top; }
  .order-table th { background: #F1F4F1; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: #6B776E; font-weight: 700; }
  .order-table .num { text-align: right; }
  .order-table .nowrap { white-space: nowrap; }
  .order-table .money { font-weight: 700; font-variant-numeric: tabular-nums; }
  .order-table .items { color: #45514A; }
  .order-section { margin-bottom: 16px; }

  .bottom-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 14px; align-items: start; }
  .mini-table th, .mini-table td { border-bottom: 1px solid #EAEEEA; padding: 5px 7px; font-size: 10.5px; text-align: left; }
  .mini-table th { color: #6B776E; font-size: 9px; text-transform: uppercase; font-weight: 700; }
  .mini-table .num { text-align: right; }

  .charges { border: 1px solid #E1E7E2; border-radius: 10px; padding: 12px 14px; }
  .charge-row { display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; }
  .charge-row.deduct { color: #B23B2E; }
  .charge-divider { border-top: 1px solid #E1E7E2; margin: 6px 0; }
  .amount-due { margin-top: 10px; border-radius: 10px; background: #1F6F4F; color: #fff; padding: 12px 14px; }
  .amount-due-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.85; }
  .amount-due-value { font-size: 20px; font-weight: 800; margin-top: 2px; }
  .amount-due-note { font-size: 9.5px; margin-top: 6px; opacity: 0.9; }

  .footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #E1E7E2; display: flex; justify-content: space-between; font-size: 9px; color: #8A9089; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="brand">
        <div class="brand-mark">O</div>
        <div>
          <div class="brand-name">ORDERLEDGER</div>
          <div class="brand-sub">Food order ledger</div>
        </div>
      </div>
      <div class="doc-title">
        <h1>Batch Invoice</h1>
        <p>Food order ledger summary</p>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-rows">
        <div class="info-row"><span>Batch ID</span><span>${escapeHtml(batchCode(batch.id))}</span></div>
        <div class="info-row"><span>Session Name</span><span>${escapeHtml(batch.title)}</span></div>
        <div class="info-row"><span>Export Date</span><span>${fmtDateTime(new Date().toISOString())}</span></div>
        <div class="info-row"><span>Reporting Period</span><span>${escapeHtml(reportingPeriod)}</span></div>
      </div>
      <div class="info-side">
        <div>
          <div class="info-side-label">Source Apps</div>
          <div class="app-badge-row">
            ${appRows.length > 0 ? appRows.map(([app, count]) => appBadge(app, count)).join("") : "<span style=\"font-size:10px;color:#8A9089\">No orders</span>"}
          </div>
        </div>
        <div>
          <div class="info-side-label">Status</div>
          <span class="status-pill ${needsReview ? "warn" : "ok"}">${needsReview ? `${summary.ordersNeedingReview} need review` : "Completed"}</span>
        </div>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><span class="stat-label">Total Spent</span><span class="stat-value">THB ${money(netTotal)}</span></div>
      <div class="stat-card"><span class="stat-label">Total Orders</span><span class="stat-value">${summary.ordersTotal}</span></div>
      <div class="stat-card"><span class="stat-label">Total Restaurants</span><span class="stat-value">${restaurantCount}</span></div>
      <div class="stat-card"><span class="stat-label">Average Per Order</span><span class="stat-value">THB ${money(avgPerOrder)}</span></div>
    </div>

    <div class="order-section">
      <h2 class="section-title">Order Details</h2>
      <table class="order-table">
        <thead>
          <tr>
            <th class="num">#</th>
            <th>Date / Time</th>
            <th>App</th>
            <th>Restaurant</th>
            <th>Items / Note</th>
            <th>Status</th>
            <th class="num">Amount (THB)</th>
          </tr>
        </thead>
        <tbody>
          ${orderRowsHtml || `<tr><td colspan="7" style="text-align:center;color:#8A9089;padding:14px;">No orders in this batch</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="bottom-grid">
      <div>
        <h2 class="section-title">Restaurant Summary (Top ${Math.min(5, topRestaurants.length) || 5})</h2>
        <table class="mini-table">
          <thead><tr><th class="num">#</th><th>Restaurant</th><th class="num">Orders</th><th class="num">Total (THB)</th></tr></thead>
          <tbody>
            ${restaurantRowsHtml || `<tr><td colspan="4" style="text-align:center;color:#8A9089;padding:10px;">No orders</td></tr>`}
          </tbody>
        </table>
      </div>
      <div>
        <h2 class="section-title">Charges Summary</h2>
        <div class="charges">
          <div class="charge-row"><span>Gross Total (${summary.ordersTotal} orders)</span><span>THB ${money(grossTotal)}</span></div>
          ${refundedTotal > 0 ? `<div class="charge-row deduct"><span>Refunded / Cancelled</span><span>- THB ${money(refundedTotal)}</span></div>` : ""}
          <div class="charge-divider"></div>
          <div class="charge-row"><span><strong>Net Amount</strong></span><span><strong>THB ${money(netTotal)}</strong></span></div>
          <div class="amount-due">
            <div class="amount-due-label">Amount Due</div>
            <div class="amount-due-value">THB ${money(netTotal)}</div>
            <div class="amount-due-note">${needsReview ? `${summary.ordersNeedingReview} order${summary.ordersNeedingReview === 1 ? "" : "s"} still need manual check &mdash; total may change.` : "All orders checked. No outstanding items."}</div>
          </div>
        </div>
        ${promptPayQr ? `
          <div style="margin-top: 12px; border: 1px dashed #1F6F4F; border-radius: 10px; padding: 10px 12px; background: #FAFAF9; text-align: center; page-break-inside: avoid;">
            <div style="font-size: 8px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #1F6F4F; margin-bottom: 6px;">Pay via PromptPay</div>
            <img src="${promptPayQr.qrDataUrl}" style="width: 130px; height: 130px; display: block; margin: 0 auto 6px; mix-blend-mode: multiply;" alt="PromptPay QR" />
            <div style="font-size: 11px; font-weight: 800; color: #1F6F4F;">THB ${money(netTotal)}</div>
            <div style="font-size: 8.5px; color: #6B776E; margin-top: 3px;">
              ID: ${escapeHtml(promptPayQr.id)}
              ${promptPayQr.recipientName ? `<br/>Recipient: ${escapeHtml(promptPayQr.recipientName)}` : ""}
            </div>
          </div>
        ` : ""}
      </div>
    </div>

    <div class="footer">
      <span>Generated by OrderLedger on ${fmtDateTime(new Date().toISOString())}</span>
      <span>${escapeHtml(batchCode(batch.id))}</span>
    </div>
  </div>
</body>
</html>`;
}
