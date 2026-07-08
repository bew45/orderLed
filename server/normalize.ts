import type { ExtractedOrder, OrderStatus, OcrRow, SourceApp } from "./types";

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
  if (raw.includes("คำสั่งซื้อของฉัน") || raw.includes("จัดส่งสำเร็จแล้ว") || raw.includes("สั่งใหม่")) return "lineman";
  if (raw.includes("shopee") || raw.includes("ช้อปปี้")) return "shopeefood";
  return "unknown";
}

export function normalizeOrderStatus(value: unknown, textHint = ""): OrderStatus {
  const raw = `${String(value ?? "")} ${textHint}`.toLowerCase();
  if (raw.includes("คืนเงิน") || raw.includes("refund")) return "refunded";
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

export function normalizeOrderedAt(value: unknown, fallbackMonth: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return `${fallbackMonth || "1970-01"}-01T00:00:00`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] ?? "00"}:${iso[5] ?? "00"}:00`;

  const en = raw.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  if (en) {
    const day = en[1].padStart(2, "0");
    const month = EN_MONTHS[en[2].slice(0, 3).toLowerCase()] ?? "01";
    const year = en[3].length === 2 ? `20${en[3]}` : en[3];
    return `${year}-${month}-${day}T${(en[4] ?? "00").padStart(2, "0")}:${en[5] ?? "00"}:00`;
  }

  const th = raw.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  if (th) {
    const day = th[1].padStart(2, "0");
    const month = THAI_MONTHS[th[2]] ?? THAI_MONTHS[th[2].replace(/\./g, "")] ?? "01";
    return `${th[3]}-${month}-${day}T${(th[4] ?? "00").padStart(2, "0")}:${th[5] ?? "00"}:00`;
  }

  return `${fallbackMonth || "1970-01"}-01T00:00:00`;
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

export function evidenceFromIds(evidence: Record<string, string[]> | undefined, rows: OcrRow[], screenshotId: string) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const out: Record<string, unknown> = {};
  for (const [field, ids] of Object.entries(evidence ?? {})) {
    const found = ids.map((id) => byId.get(id)).filter(Boolean) as OcrRow[];
    if (!found.length) continue;
    out[field] = found.map((row) => ({ text: row.text, screenshotId, bbox: row.bbox, confidence: row.confidence }));
  }
  return out;
}

export function normalizeExtractedOrder(input: ExtractedOrder, fallback: { month: string; sourceApp: SourceApp }) {
  const sourceApp = normalizeSourceApp(input.sourceApp ?? fallback.sourceApp);
  const restaurantName = normalizeRestaurant(input.restaurantName);
  const totalAmount = amount(input.totalAmount);
  const refundAmount = amount(input.refundAmount);
  const status = normalizeOrderStatus(input.status, `${restaurantName} ${input.itemsText ?? ""}`);
  const orderedAt = normalizeOrderedAt(input.orderedAt, fallback.month);
  const net = netAmount(status, totalAmount, refundAmount);
  return {
    sourceApp,
    orderedAt,
    restaurantName,
    totalAmount,
    status,
    refundAmount,
    netAmount: net,
    itemsText: String(input.itemsText ?? "").trim(),
    duplicateKey: duplicateKey({ sourceApp, orderedAt, restaurantName, totalAmount })
  };
}
