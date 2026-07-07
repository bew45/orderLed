import { createBatch, getBatchSummary, upsertOrder } from "../server/store";

type MonthlyTotal = {
  label: string;
  isoDate: string;
  amount: number;
};

const DEFAULT_TOTALS: MonthlyTotal[] = [
  { label: "18/1/2025", isoDate: "2025-01-18", amount: 8384 },
  { label: "7/3/2025", isoDate: "2025-03-07", amount: 17270.6 },
  { label: "21/4/2025", isoDate: "2025-04-21", amount: 11869.9 },
  { label: "3/6/2025", isoDate: "2025-06-03", amount: 11068 },
  { label: "5/7/2025", isoDate: "2025-07-05", amount: 11364.65 },
  { label: "6/8/2025", isoDate: "2025-08-06", amount: 7305.72 },
  { label: "20/9/2025", isoDate: "2025-09-20", amount: 12672 },
  { label: "30/11/2025", isoDate: "2025-11-30", amount: 22799.12 },
  { label: "1/2/26", isoDate: "2026-02-01", amount: 13671 },
  { label: "16/4/26", isoDate: "2026-04-16", amount: 14572 }
];

function money(value: number) {
  return Math.round(value * 100) / 100;
}

const title = process.argv.slice(2).join(" ").trim() || "Legacy monthly totals";
const batch = createBatch({ title, month: "2026-04" });

for (const total of DEFAULT_TOTALS) {
  const month = total.isoDate.slice(0, 7);
  upsertOrder({
    batchId: batch.id,
    sourceApp: "unknown",
    orderedAt: `${total.isoDate}T12:00`,
    restaurantName: "Legacy monthly total",
    totalAmount: money(total.amount),
    status: "completed",
    refundAmount: 0,
    netAmount: money(total.amount),
    itemsText: `Monthly total snapshot for ${total.label}`,
    confidence: 1,
    reviewState: "ok",
    duplicateKey: `legacy-monthly-total:${month}:${total.amount}`,
    sourceScreenshotId: `legacy-monthly-total:${month}`,
    evidence: {
      type: "legacy_monthly_total",
      date: total.label,
      month,
      amount: total.amount
    }
  });
}

const summary = getBatchSummary(batch.id);

console.log(JSON.stringify({
  batchId: batch.id,
  title: batch.title,
  imported: DEFAULT_TOTALS.length,
  months: DEFAULT_TOTALS.map((total) => total.isoDate.slice(0, 7)),
  summary
}, null, 2));
