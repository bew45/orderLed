import { amount, guessSourceAppFromText, normalizeOrderStatus } from "../normalize";
import type { ExtractedOrder, OcrRow, SourceApp } from "../types";

const DATE_RE = /(\d{1,2}\s+[A-Za-z]{3,}\s+\d{2,4}(?:,?\s+\d{1,2}:\d{2})?|\d{1,2}\s*[ก-๙.]+\s*\d{4}(?:,?\s+\d{1,2}:\d{2})?)/;
const AMOUNT_RE = /฿\s*[0-9,.]+|THB\s*[0-9,.]+/i;

function likelyRestaurant(line: string) {
  const raw = line.trim();
  if (!raw) return false;
  if (DATE_RE.test(raw) || AMOUNT_RE.test(raw)) return false;
  if (/reorder|order completed|จัดส่งสำเร็จ|สั่งใหม่|คืนเงิน|ให้คะแนน/i.test(raw)) return false;
  return raw.length >= 3;
}

export function extractWithHeuristics(rows: OcrRow[], fallbackApp: SourceApp): { sourceApp: SourceApp; orders: ExtractedOrder[] } {
  const allText = rows.map((row) => row.text).join("\n");
  const sourceApp = guessSourceAppFromText(allText) === "unknown" ? fallbackApp : guessSourceAppFromText(allText);
  const orders: ExtractedOrder[] = [];
  const amountRows = rows.filter((row) => AMOUNT_RE.test(row.text));

  for (const amountRow of amountRows) {
    const before = rows.filter((row) => row.bbox.y <= amountRow.bbox.y + 0.03);
    const dateRow = [...before].reverse().find((row) => DATE_RE.test(row.text));
    const restaurantRow = [...before].reverse().find((row) => likelyRestaurant(row.text));
    const nearbyText = rows
      .filter((row) => Math.abs(row.bbox.y - amountRow.bbox.y) < 0.18)
      .map((row) => row.text)
      .join(" ");
    orders.push({
      sourceApp,
      orderedAt: dateRow?.text ?? "",
      restaurantName: restaurantRow?.text ?? "",
      totalAmount: amount(amountRow.text),
      status: normalizeOrderStatus("", nearbyText),
      refundAmount: /คืนเงิน|refund/i.test(nearbyText) ? amount(amountRow.text) : 0,
      itemsText: "",
      evidence: {
        amount: [amountRow.id],
        date: dateRow ? [dateRow.id] : [],
        restaurant: restaurantRow ? [restaurantRow.id] : []
      }
    });
  }

  return { sourceApp, orders };
}
