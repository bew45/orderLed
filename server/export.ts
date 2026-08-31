import puppeteer, { type Browser } from "puppeteer";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { getBatch, getBatchSummary, getLedgerDashboard, getLedgerOrders, listOrders, getAppSettings } from "./store";
import { renderBatchInvoiceHtml } from "./pdf-template";
import type { Batch, MonthBucket, OrderRow, PdfStyle, ReviewTier } from "./types";

function batchOrThrow(batchId: string) {
  const batch = getBatch(batchId);
  if (!batch) throw new Error("Batch not found");
  return batch;
}

function baseName(title: string, month: string) {
  return `${title || "orderledger"}-${month}`.normalize("NFKC").replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").replace(/\s+/g, "_");
}

function filterOrders(orders: OrderRow[], month?: string) {
  if (!month) return orders;
  if (month === "unknown") return orders.filter((order) => !/^\d{4}-\d{2}/.test(order.ordered_at || ""));
  return orders.filter((order) => order.ordered_at.slice(0, 7) === month);
}

function monthOf(order: OrderRow) {
  return /^\d{4}-\d{2}/.test(order.ordered_at || "") ? order.ordered_at.slice(0, 7) : "unknown";
}

/** Confirmed = clean + review. Blocked rows never enter a baht total (D4). */
function isConfirmed(order: OrderRow) {
  return (order.review_tier as ReviewTier) !== "blocked";
}

function summarizeOrders(orders: OrderRow[]) {
  const confirmed = orders.filter(isConfirmed);
  const completedSpend = confirmed.filter((o) => o.status === "completed").reduce((sum, o) => sum + o.total_amount, 0);
  const grossSpend = confirmed.reduce((sum, o) => sum + o.total_amount, 0);
  const netSpend = confirmed.reduce((sum, o) => sum + o.net_amount, 0);
  return {
    netSpend: Math.round(netSpend * 100) / 100,
    completedSpend: Math.round(completedSpend * 100) / 100,
    grossSpend: Math.round(grossSpend * 100) / 100,
    refundedOrCancelled: Math.round((grossSpend - netSpend) * 100) / 100,
    ordersTotal: orders.length,
    ordersNeedingReview: orders.filter((o) => (o.review_tier as ReviewTier) !== "clean").length,
    ordersBlocked: orders.filter((o) => (o.review_tier as ReviewTier) === "blocked").length
  };
}

function orderRows(orders: OrderRow[]) {
  return orders.map((order) => ({
    Month: monthOf(order),
    Date: order.ordered_at.slice(0, 10),
    Time: /T\d{2}:\d{2}/.test(order.ordered_at) && !/T00:00(:00)?$/.test(order.ordered_at) ? order.ordered_at.slice(11, 16) : "",
    App: order.source_app,
    Restaurant: order.restaurant_name,
    Branch: order.branch,
    Status: order.status,
    "Total Amount": order.total_amount,
    "Refund Amount": order.refund_amount,
    "Net Amount": order.net_amount,
    Items: order.items_text,
    Tier: order.review_tier,
    Confidence: order.confidence
  }));
}

function monthlyRows(buckets: MonthBucket[]) {
  return buckets.map((bucket) => ({
    Month: bucket.month,
    Orders: bucket.orderCount,
    "Net Spend": bucket.netSpend,
    "Completed Spend": bucket.completedSpend,
    "Refunded / Cancelled": bucket.refundedOrCancelled,
    Grab: bucket.byAppSpend.grab,
    "LINE MAN": bucket.byAppSpend.lineman,
    ShopeeFood: bucket.byAppSpend.shopeefood,
    "Needs review": bucket.reviewCount
  }));
}

function ledgerBatchStub(period?: string): Batch {
  const now = Date.now();
  return {
    id: "ledger",
    title: period ? `OrderLedger ${period}` : "OrderLedger — all periods",
    month: period ?? new Date().toISOString().slice(0, 7),
    created_at: now,
    updated_at: now
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlTable(title: string, rows: Record<string, unknown>[]) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return [
    `<h2>${escapeHtml(title)}</h2>`,
    "<table>",
    `<tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>`,
    ...rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`),
    "</table>"
  ].join("\n");
}

export function buildExcelExport(batchId: string, opts: { month?: string } = {}) {
  const batch = batchOrThrow(batchId);
  const orders = filterOrders(listOrders(batchId), opts.month);
  const summary = opts.month ? summarizeOrders(orders) : getBatchSummary(batchId);
  const summaryRows = [
    { Metric: "Net spend (confirmed)", Value: summary.netSpend },
    { Metric: "Completed spend", Value: summary.completedSpend },
    { Metric: "Refunded or cancelled", Value: summary.refundedOrCancelled },
    { Metric: "Order count", Value: summary.ordersTotal },
    { Metric: "Needs review", Value: summary.ordersNeedingReview },
    { Metric: "Blocked (excluded from totals)", Value: (summary as { ordersBlocked?: number }).ordersBlocked ?? 0 }
  ];

  const byApp = new Map<string, { App: string; Count: number; Net: number; Completed: number }>();
  for (const order of orders) {
    const row = byApp.get(order.source_app) ?? { App: order.source_app, Count: 0, Net: 0, Completed: 0 };
    row.Count += 1;
    row.Net += order.net_amount;
    if (order.status === "completed") row.Completed += order.total_amount;
    byApp.set(order.source_app, row);
  }

  const byRestaurant = new Map<string, { Restaurant: string; Count: number; Net: number; Average: number }>();
  for (const order of orders) {
    const key = order.restaurant_name || "Unknown";
    const row = byRestaurant.get(key) ?? { Restaurant: key, Count: 0, Net: 0, Average: 0 };
    row.Count += 1;
    row.Net += order.net_amount;
    row.Average = row.Count ? Math.round((row.Net / row.Count) * 100) / 100 : 0;
    byRestaurant.set(key, row);
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Tahoma, Arial, sans-serif; }
    table { border-collapse: collapse; margin-bottom: 28px; }
    th, td { border: 1px solid #c9b98f; padding: 6px 8px; }
    th { background: #f3ead7; font-weight: bold; }
  </style>
</head>
<body>
  <h1>${escapeHtml(batch.title)}${opts.month ? ` (${escapeHtml(opts.month)})` : ""}</h1>
  ${htmlTable("Orders", orderRows(orders))}
  ${htmlTable("Summary", summaryRows)}
  ${htmlTable("By App", [...byApp.values()])}
  ${htmlTable("By Restaurant", [...byRestaurant.values()])}
</body>
</html>`;

  return {
    buffer: Buffer.from(html, "utf8"),
    contentType: "application/vnd.ms-excel; charset=utf-8",
    filename: `${baseName(batch.title, opts.month ?? batch.month)}.xls`
  };
}

export function buildCsvExport(batchId: string, opts: { month?: string } = {}) {
  const batch = batchOrThrow(batchId);
  const rows = orderRows(filterOrders(listOrders(batchId), opts.month));
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [
    columns.map(escape).join(","),
    ...rows.map((row) => {
      const record = row as Record<string, unknown>;
      return columns.map((column) => escape(record[column])).join(",");
    })
  ].join("\n");
  return {
    buffer: Buffer.from(csv, "utf8"),
    contentType: "text/csv; charset=utf-8",
    filename: `${baseName(batch.title, opts.month ?? batch.month)}.csv`
  };
}

// ---- Ledger-scope exports (whole ledger, or one accounting period) ----

function rowsToCsv(rows: Record<string, unknown>[]) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    columns.map(escape).join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))
  ].join("\n");
}

export function buildLedgerCsvExport(opts: { period?: string } = {}) {
  const rows = orderRows(getLedgerOrders(opts.period));
  return {
    buffer: Buffer.from(rowsToCsv(rows), "utf8"),
    contentType: "text/csv; charset=utf-8",
    filename: `${baseName("orderledger", opts.period ?? "all")}.csv`
  };
}

export function buildLedgerExcelExport(opts: { period?: string } = {}) {
  const orders = getLedgerOrders(opts.period);
  const summary = summarizeOrders(orders);
  const dashboard = getLedgerDashboard();
  const months = opts.period ? dashboard.months.filter((m) => m.month === opts.period) : dashboard.months;

  const summaryRows = [
    { Metric: "Net spend (confirmed)", Value: summary.netSpend },
    { Metric: "Gross spend", Value: summary.grossSpend },
    { Metric: "Refunded or cancelled", Value: summary.refundedOrCancelled },
    { Metric: "Order count", Value: summary.ordersTotal },
    { Metric: "Needs review", Value: summary.ordersNeedingReview },
    { Metric: "Blocked (excluded from totals)", Value: summary.ordersBlocked }
  ];

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Tahoma, Arial, sans-serif; }
    table { border-collapse: collapse; margin-bottom: 28px; }
    th, td { border: 1px solid #c9b98f; padding: 6px 8px; }
    th { background: #f3ead7; font-weight: bold; }
  </style>
</head>
<body>
  <h1>OrderLedger${opts.period ? ` (${escapeHtml(opts.period)})` : " — all periods"}</h1>
  ${htmlTable("Monthly", monthlyRows(months))}
  ${htmlTable("Summary", summaryRows)}
  ${htmlTable("Orders", orderRows(orders))}
</body>
</html>`;

  return {
    buffer: Buffer.from(html, "utf8"),
    contentType: "application/vnd.ms-excel; charset=utf-8",
    filename: `${baseName("orderledger", opts.period ?? "all")}.xls`
  };
}

let browserPromise: Promise<Browser> | null = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function buildPdfExport(batchId: string, opts: { month?: string; style?: PdfStyle } = {}) {
  const batch = batchOrThrow(batchId);
  const orders = filterOrders(listOrders(batchId), opts.month);
  const summary = opts.month ? summarizeOrders(orders) : getBatchSummary(batchId);

  let qrDataUrl: string | null = null;
  const settings = getAppSettings();
  const style = opts.style ?? settings.pdf_style;
  if (settings.promptpay_qr_enabled && settings.promptpay_id) {
    try {
      const amount = settings.promptpay_amount_locked ? summary.netSpend : undefined;
      const payload = generatePayload(settings.promptpay_id, amount !== undefined ? { amount } : {});
      qrDataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 180
      });
    } catch (err) {
      console.error("Failed to generate PromptPay QR:", err);
    }
  }

  const html = renderBatchInvoiceHtml({
    batch,
    orders,
    summary,
    month: opts.month,
    style,
    promptPayQr: qrDataUrl ? {
      qrDataUrl,
      id: settings.promptpay_id,
      recipientName: settings.promptpay_recipient_name
    } : undefined
  });

  return renderPdf(html, `${baseName(batch.title, opts.month ?? batch.month)}.pdf`);
}

async function renderPdf(html: string, filename: string) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0px", bottom: "0px", left: "0px", right: "0px" }
    });
    return { buffer: Buffer.from(buffer), contentType: "application/pdf", filename };
  } finally {
    await page.close();
  }
}

export async function buildLedgerPdfExport(opts: { period?: string; style?: PdfStyle } = {}) {
  const orders = getLedgerOrders(opts.period);
  const summary = summarizeOrders(orders);
  const settings = getAppSettings();
  const style = opts.style ?? settings.pdf_style;

  let qrDataUrl: string | null = null;
  if (settings.promptpay_qr_enabled && settings.promptpay_id) {
    try {
      const amount = settings.promptpay_amount_locked ? summary.netSpend : undefined;
      const payload = generatePayload(settings.promptpay_id, amount !== undefined ? { amount } : {});
      qrDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 180 });
    } catch (err) {
      console.error("Failed to generate PromptPay QR:", err);
    }
  }

  const html = renderBatchInvoiceHtml({
    batch: ledgerBatchStub(opts.period),
    orders,
    summary,
    month: opts.period,
    style,
    promptPayQr: qrDataUrl
      ? { qrDataUrl, id: settings.promptpay_id, recipientName: settings.promptpay_recipient_name }
      : undefined
  });

  return renderPdf(html, `${baseName("orderledger", opts.period ?? "all")}.pdf`);
}
