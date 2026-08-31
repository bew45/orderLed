import type { DatePrecision, ExtractedOrder, OrderStatus, SourceApp } from "./types";

const THAI_MONTHS: Record<string, string> = {
  "ม.ค.": "01",
  "มค": "01",
  "ก.พ.": "02",
  "กพ": "02",
  "มี.ค.": "03",
  "มีค": "03",
  "เม.ย.": "04",
  "เมย": "04",
  "พ.ค.": "05",
  "พค": "05",
  "มิ.ย.": "06",
  "มิย": "06",
  "ก.ค.": "07",
  "กค": "07",
  "ส.ค.": "08",
  "สค": "08",
  "ก.ย.": "09",
  "กย": "09",
  "ต.ค.": "10",
  "ตค": "10",
  "พ.ย.": "11",
  "พย": "11",
  "ธ.ค.": "12",
  "ธค": "12"
};

const EN_MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12"
};

export function normalizeSourceApp(value: unknown): SourceApp {
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("grab")) return "grab";
  if (raw.includes("line") || raw.includes("lineman")) return "lineman";
  if (raw.includes("shopee")) return "shopeefood";
  return "unknown";
}

export function guessSourceAppFromText(text: string): SourceApp {
  const raw = text.toLowerCase();
  if (raw.includes("grabcoins") || raw.includes("activity history")) return "grab";
  if (
    raw.includes("คำสั่งซื้อของฉัน") ||
    raw.includes("จัดส่งสำเร็จแล้ว") ||
    raw.includes("ให้คะแนนและทิป") ||
    raw.includes("ดีลล็อกราคา") ||
    raw.includes("shopee") ||
    raw.includes("ช้อปปี้")
  ) return "shopeefood";
  if (
    raw.includes("order history") ||
    raw.includes("food delivery") ||
    (raw.includes("ongoing") && (raw.includes("canceled") || raw.includes("cancelled")))
  ) return "lineman";
  if (/[\u0E00-\u0E7F]/u.test(raw) && !/[A-Za-z]/.test(raw)) return "shopeefood";
  return "unknown";
}

export function normalizeOrderStatus(value: unknown, textHint = ""): OrderStatus {
  const raw = `${String(value ?? "")} ${textHint}`.toLowerCase();
  const compact = raw.replace(/\s+/g, "");
  if (
    raw.includes("\u0e04\u0e37\u0e19\u0e40\u0e07\u0e34\u0e19") ||
    compact.includes("\u0e04\u0e37\u0e19\u0e40\u0e07\u0e34\u0e19") ||
    raw.includes("\u0e40\u0e07\u0e34\u0e19\u0e04\u0e37\u0e19") ||
    compact.includes("\u0e40\u0e07\u0e34\u0e19\u0e04\u0e37\u0e19") ||
    raw.includes("refund")
  ) return "refunded";
  if (raw.includes("ยกเลิก") || raw.includes("cancelled") || raw.includes("canceled")) return "cancelled";
  if (raw.includes("completed") || raw.includes("สำเร็จ") || raw.includes("delivered")) return "completed";
  return "unknown";
}

export function amount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;
  const raw = String(value ?? "").replace(/,/g, "");
  const match = raw.match(/(?:฿|THB)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!match) return 0;
  return Math.round(Number(match[1]) * 100) / 100;
}

type NormalizedDate = {
  /** "" | "YYYY-MM" | "YYYY-MM-DDTHH:MM:SS" */
  value: string;
  precision: DatePrecision;
};

const RELATIVE_DATE_RE =
  /\b(yesterday|today|tomorrow|(?:a|\d+)\s*(?:min(?:ute)?s?|hours?|days?|weeks?)\s*ago|just now)\b|เมื่อวาน|วันนี้|พรุ่งนี้|(?:ที่แล้ว|ก่อน)$|นาทีที่แล้ว|ชั่วโมงที่แล้ว|วันก่อน/i;

/** The 3 target apps' history lists always show an absolute date; relative text is abnormal (D5). */
export function isRelativeDateText(raw: string) {
  return RELATIVE_DATE_RE.test(raw.trim());
}

function validDate(year: number, month: number, day: number, hour: number, minute: number) {
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isoDate(year: number, month: number, day: number, hour = 0, minute = 0) {
  if (!validDate(year, month, day, hour, minute)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function gregorianYear(raw: string) {
  const year = Number(raw);
  if (!Number.isFinite(year)) return 0;
  // Thai delivery apps normally show Buddhist Era years. Keep a generous upper
  // bound so a malformed OCR year cannot silently become a plausible Gregorian one.
  if (year >= 2400 && year <= 2800) return year - 543;
  return raw.length === 2 ? 2000 + year : year;
}

function parseOrderedAt(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0));

  const en = raw.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  if (en) {
    const month = Number(EN_MONTHS[en[2].slice(0, 3).toLowerCase()]);
    return isoDate(gregorianYear(en[3]), month, Number(en[1]), Number(en[4] ?? 0), Number(en[5] ?? 0));
  }

  const th = raw.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  if (th) {
    const month = Number(THAI_MONTHS[th[2]] ?? THAI_MONTHS[th[2].replace(/\./g, "")]);
    return isoDate(gregorianYear(th[3]), month, Number(th[1]), Number(th[4] ?? 0), Number(th[5] ?? 0));
  }

  return null;
}

const FUTURE_SLACK_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Parse an on-screen date string. No batch-month fallback (bug B6): if we cannot
 * read it, or it is relative text (D5), or it lands in the future, the order gets
 * an empty date and precision "none" so it lands in the "unknown month" bucket
 * instead of a fabricated real month.
 */
function normalizedDate(value: unknown, now: number = Date.now()): NormalizedDate {
  const raw = String(value ?? "").trim();
  if (!raw) return { value: "", precision: "none" };
  if (isRelativeDateText(raw)) return { value: "", precision: "none" };
  const parsed = parseOrderedAt(raw);
  if (!parsed) return { value: "", precision: "none" };
  const ts = Date.parse(parsed);
  if (Number.isFinite(ts) && ts > now + FUTURE_SLACK_MS) return { value: "", precision: "none" };
  return { value: parsed, precision: "full" };
}

export function normalizeOrderedAt(value: unknown, now?: number) {
  return normalizedDate(value, now).value;
}

export function normalizeRestaurant(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function duplicateKey(input: {
  sourceApp: SourceApp;
  orderedAt: string;
  restaurantName: string;
  totalAmount: number;
}) {
  const restaurant = normalizeRestaurant(input.restaurantName)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
  const dt = input.orderedAt.slice(0, 16);
  return [input.sourceApp, dt, restaurant, input.totalAmount.toFixed(2)].join("|");
}

export function netAmount(status: OrderStatus, total: number, refund: number) {
  if (status === "cancelled") return 0;
  if (status === "refunded") return Math.max(0, Math.round((total - refund) * 100) / 100);
  return total;
}

export function isTruncatedName(raw: string) {
  return /(?:…|\.\.\.)\s*$/.test(String(raw ?? "").trim());
}

export type NormalizedOrder = {
  sourceApp: SourceApp;
  orderedAt: string;
  datePrecision: DatePrecision;
  restaurantName: string;
  restaurantTruncated: boolean;
  branch: string;
  totalAmount: number;
  totalAmountText: string;
  refundAmount: number;
  netAmount: number;
  status: OrderStatus;
  itemCount: number;
  itemsText: string;
  partial: boolean;
  attentionReasons: string[];
  duplicateKey: string;
};

export function normalizeExtractedOrder(
  input: ExtractedOrder,
  ctx: { sourceApp: SourceApp; uniqueSeed?: string; now?: number }
): NormalizedOrder {
  const sourceApp = normalizeSourceApp(input.sourceApp ?? ctx.sourceApp);
  const restaurantRaw = String(input.restaurantName ?? "");
  const restaurantName = normalizeRestaurant(restaurantRaw);
  const restaurantTruncated = isTruncatedName(restaurantRaw) || isTruncatedName(restaurantName);
  const branch = normalizeRestaurant(input.branch);
  const totalAmount = amount(input.totalAmount ?? input.totalAmountText);
  const totalAmountText = String(input.totalAmountText ?? "").trim();
  const refundAmount = amount(input.refundAmount);
  const status = normalizeOrderStatus(input.status, `${restaurantName} ${input.itemsText ?? ""}`);
  const dateInput = String(input.orderedAtText ?? "").trim() || input.orderedAt;
  const date = normalizedDate(dateInput, ctx.now);
  const orderedAt = date.value;
  const net = netAmount(status, totalAmount, refundAmount);
  const itemCount = Math.max(0, Math.round(Number(input.itemCount) || 0));
  const partial = Boolean(input.partial);

  const attentionReasons: string[] = [];
  if (date.precision === "none") {
    attentionReasons.push(isRelativeDateText(String(dateInput ?? "")) ? "date_relative" : "date_missing");
  }
  if (sourceApp === "unknown") attentionReasons.push("source_app_unknown");
  if (!restaurantName) attentionReasons.push("restaurant_unreadable");
  if (status === "unknown") attentionReasons.push("status_unknown");
  if (refundAmount > totalAmount) attentionReasons.push("refund_exceeds_total");
  if (partial) attentionReasons.push("card_partial");
  if (restaurantTruncated) attentionReasons.push("restaurant_truncated");

  // Strong identity requires a real date + known app + a restaurant name. Weak
  // identities never merge (bug B12 mitigation): a re-read reuses the same seed,
  // an overlapping screenshot stays a separate row for the user to compare.
  const strongIdentity = date.precision !== "none" && sourceApp !== "unknown" && Boolean(restaurantName);
  return {
    sourceApp,
    orderedAt,
    datePrecision: date.precision,
    restaurantName,
    restaurantTruncated,
    branch,
    totalAmount,
    totalAmountText,
    refundAmount,
    netAmount: net,
    status,
    itemCount,
    itemsText: String(input.itemsText ?? "").trim(),
    partial,
    attentionReasons,
    duplicateKey: strongIdentity
      ? duplicateKey({ sourceApp, orderedAt, restaurantName, totalAmount })
      : `unresolved|${ctx.uniqueSeed || `${sourceApp}|${orderedAt}|${restaurantName}|${totalAmount.toFixed(2)}`}`
  };
}
