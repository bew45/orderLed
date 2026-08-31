import type { NormalizedOrder } from "../normalize";
import type { OrderFlag, ReviewTier } from "../types";

export type AmountSignal = "verified" | "weak" | "missing";

export type OrderSignals = {
  amount: AmountSignal;
  /** set when another ledger row already owns this duplicate_key with a different amount/status */
  dupConflictWith?: string | null;
};

export type OrderAssessment = {
  confidence: number;
  reviewTier: ReviewTier;
  flags: OrderFlag[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Per-order confidence + review tier (see docs/REDESIGN_PLAN.md §4).
 * Replaces reviewStateFromAmountCheck (bugs B1, B15).
 */
export function assessOrder(order: NormalizedOrder, signals: OrderSignals): OrderAssessment {
  const flags: OrderFlag[] = [];

  const amountScore = signals.amount === "verified" ? 1 : signals.amount === "weak" ? 0.4 : 0;
  if (signals.amount === "missing") {
    flags.push({ code: "amount_missing", field: "total_amount", severity: "block", detail: "โมเดลอ่านยอดไม่ได้" });
  } else if (signals.amount === "weak") {
    flags.push({ code: "amount_unverified", field: "total_amount", severity: "warn", detail: "OCR ยืนยันยอดไม่ได้" });
  }

  const dateScore = order.datePrecision === "full" ? 1 : order.datePrecision === "month" ? 0.6 : 0;
  if (order.datePrecision === "none") {
    if (order.attentionReasons.includes("date_relative")) {
      flags.push({ code: "date_relative", field: "ordered_at", severity: "block", detail: "วันที่เป็นข้อความสัมพัทธ์" });
    } else {
      flags.push({ code: "date_missing", field: "ordered_at", severity: "warn", detail: "อ่านวันที่ไม่ได้" });
    }
  } else if (order.datePrecision === "month") {
    flags.push({ code: "date_month_only", field: "ordered_at", severity: "info", detail: "รู้แค่เดือน ไม่รู้วัน" });
  }

  const statusScore = order.status === "unknown" ? 0.3 : 1;
  if (order.status === "unknown") flags.push({ code: "status_unknown", field: "status", severity: "warn" });

  const restaurantScore = order.restaurantName ? 1 : 0;
  if (!order.restaurantName) flags.push({ code: "restaurant_missing", field: "restaurant_name", severity: "warn" });

  const appScore = order.sourceApp === "unknown" ? 0.4 : 1;
  if (order.sourceApp === "unknown") flags.push({ code: "app_unknown", field: "source_app", severity: "info" });

  if (order.partial) flags.push({ code: "card_partial", field: "", severity: "block", detail: "การ์ดโดนตัดขอบจอ" });
  if (order.restaurantTruncated) {
    flags.push({ code: "restaurant_truncated", field: "restaurant_name", severity: "info", detail: "ชื่อร้านถูกตัด" });
  }
  if (order.refundAmount > order.totalAmount) {
    flags.push({ code: "refund_exceeds_total", field: "refund_amount", severity: "warn" });
  }
  if (signals.dupConflictWith) {
    flags.push({ code: "dup_conflict", field: "", severity: "block", detail: `ซ้ำกับรายการ ${signals.dupConflictWith} คนละยอด/สถานะ` });
  }

  const confidence = round2(
    0.45 * amountScore + 0.2 * statusScore + 0.2 * dateScore + 0.1 * restaurantScore + 0.05 * appScore
  );

  const weakSecondary = [
    order.datePrecision === "none",
    order.status === "unknown",
    !order.restaurantName,
    order.sourceApp === "unknown"
  ].filter(Boolean).length;

  let reviewTier: ReviewTier;
  if (
    signals.amount === "missing" ||
    Boolean(signals.dupConflictWith) ||
    order.partial ||
    order.attentionReasons.includes("date_relative") ||
    weakSecondary >= 2
  ) {
    reviewTier = "blocked";
    if (weakSecondary >= 2 && !flags.some((f) => f.code === "multi_weak")) {
      flags.push({ code: "multi_weak", field: "", severity: "block", detail: `${weakSecondary} ฟิลด์อ่านไม่ชัด` });
    }
  } else if (
    signals.amount === "weak" ||
    order.datePrecision !== "full" ||
    order.status === "unknown" ||
    !order.restaurantName ||
    order.sourceApp === "unknown" ||
    order.refundAmount > order.totalAmount
  ) {
    reviewTier = "review";
  } else {
    reviewTier = "clean";
  }

  return { confidence, reviewTier, flags };
}
