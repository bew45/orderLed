import { upsertOrder } from "./store";

type ParsedDate = {
  isoDate: string;
  label: string;
};

const SUMMARY_WORD = /^(sum|total|#value!|first|z|v)$/i;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseDateCell(value: string): ParsedDate | null {
  const text = value.trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (!day || !month || month > 12 || day > 31) return null;

  if (year < 100) {
    year = year >= 60 ? year + 2500 - 543 : year + 2000;
  } else if (year > 2400) {
    year -= 543;
  }
  if (year < 2000 || year > 2100) return null;

  return {
    isoDate: `${year}-${pad2(month)}-${pad2(day)}`,
    label: `${day}/${month}/${year}`
  };
}

function parseAmountCell(value: string) {
  const text = value.trim().replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount === 0) return null;
  if (Math.abs(amount) > 3000) return null;
  return Math.round(amount * 100) / 100;
}

function hasSummaryMarker(cells: string[], index: number) {
  for (let i = Math.max(0, index - 1); i <= Math.min(cells.length - 1, index + 1); i += 1) {
    if (SUMMARY_WORD.test(cells[i]?.trim() ?? "")) return true;
  }
  return false;
}

export function importLegacyAmountText(batchId: string, text: string) {
  const activeDates = new Map<number, ParsedDate>();
  const months = new Set<string>();
  let imported = 0;
  let skipped = 0;

  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line.trim()) continue;
    const cells = line.split("\t").map((cell) => cell.trim());

    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const parsedDate = parseDateCell(cells[cellIndex]);
      if (parsedDate) activeDates.set(cellIndex, parsedDate);
    }

    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      if (parseDateCell(cells[cellIndex])) continue;
      const amount = parseAmountCell(cells[cellIndex]);
      if (amount === null) continue;
      const parsedDate = activeDates.get(cellIndex);
      if (!parsedDate || hasSummaryMarker(cells, cellIndex)) {
        skipped += 1;
        continue;
      }

      const status = amount < 0 ? "refunded" : "completed";
      const totalAmount = amount < 0 ? 0 : amount;
      const refundAmount = amount < 0 ? Math.abs(amount) : 0;
      const netAmount = amount;
      const orderedAt = `${parsedDate.isoDate}T12:00`;
      months.add(parsedDate.isoDate.slice(0, 7));

      upsertOrder({
        batchId,
        sourceApp: "unknown",
        orderedAt,
        restaurantName: "Legacy amount-only entry",
        totalAmount,
        status,
        refundAmount,
        netAmount,
        itemsText: "Imported from legacy amount-only table",
        reviewState: "ok",
        duplicateKey: `legacy:${parsedDate.isoDate}:${amount}:${lineIndex}:${cellIndex}`,
        sourceScreenshotId: `legacy:${lineIndex}:${cellIndex}`,
        evidence: {
          type: "legacy_amount_text",
          date: parsedDate.label,
          amount,
          line: lineIndex + 1,
          column: cellIndex + 1
        }
      });
      imported += 1;
    }
  }

  return {
    imported,
    skipped,
    months: [...months].sort()
  };
}
