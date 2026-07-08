import { existsSync } from "fs";
import PDFDocument from "pdfkit";
import { getBatch, getBatchSummary, listOrders } from "./store";
import type { OrderRow } from "./types";

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

function summarizeOrders(orders: OrderRow[]) {
  const completedSpend = orders.filter((o) => o.status === "completed").reduce((sum, o) => sum + o.total_amount, 0);
  const netSpend = orders.reduce((sum, o) => sum + o.net_amount, 0);
  return {
    netSpend: Math.round(netSpend * 100) / 100,
    completedSpend: Math.round(completedSpend * 100) / 100,
    refundedOrCancelled: Math.round((completedSpend - netSpend) * 100) / 100,
    ordersTotal: orders.length,
    ordersNeedingReview: orders.filter((o) => o.review_state === "needs_check").length
  };
}

function orderRows(orders: OrderRow[]) {
  return orders.map((order) => ({
    Date: order.ordered_at.slice(0, 10),
    Time: order.ordered_at.slice(11, 16),
    App: order.source_app,
    Restaurant: order.restaurant_name,
    Status: order.status,
    "Total Amount": order.total_amount,
    "Refund Amount": order.refund_amount,
    "Net Amount": order.net_amount,
    Items: order.items_text,
    "Check State": order.review_state
  }));
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
    { Metric: "Net spend", Value: summary.netSpend },
    { Metric: "Completed spend", Value: summary.completedSpend },
    { Metric: "Refunded or cancelled", Value: summary.refundedOrCancelled },
    { Metric: "Order count", Value: summary.ordersTotal },
    { Metric: "Needs check", Value: summary.ordersNeedingReview }
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

function resolveThaiFont() {
  const candidates = [
    "C:/Windows/Fonts/tahoma.ttf",
    "C:/Windows/Fonts/THSarabunNew.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf"
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

export async function buildPdfExport(batchId: string, opts: { month?: string } = {}) {
  const batch = batchOrThrow(batchId);
  const orders = filterOrders(listOrders(batchId), opts.month);
  const summary = opts.month ? summarizeOrders(orders) : getBatchSummary(batchId);
  const fontPath = resolveThaiFont();

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    if (fontPath) doc.font(fontPath);

    doc.fontSize(20).text("OrderLedger", { continued: false });
    doc.fontSize(12).fillColor("#555").text(`${batch.title}${opts.month ? ` - ${opts.month}` : ""}`);
    doc.moveDown();
    doc.fillColor("#111").fontSize(12).text(`Net spend: ${summary.netSpend.toFixed(2)} THB`);
    doc.text(`Completed spend: ${summary.completedSpend.toFixed(2)} THB`);
    doc.text(`Orders: ${summary.ordersTotal}`);
    doc.text(`Needs check: ${summary.ordersNeedingReview}`);
    doc.moveDown();
    doc.fontSize(10);
    for (const order of orders.slice(0, 120)) {
      doc.text(`${order.ordered_at.slice(0, 10)} ${order.source_app} ${order.restaurant_name} ${order.net_amount.toFixed(2)} THB (${order.status})`);
    }
    if (orders.length > 120) doc.text(`...and ${orders.length - 120} more rows`);
    doc.end();
  });

  return {
    buffer,
    contentType: "application/pdf",
    filename: `${baseName(batch.title, opts.month ?? batch.month)}.pdf`
  };
}
