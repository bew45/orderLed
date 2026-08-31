import type { AmountCandidate, AmountCheck, OcrRow } from "../types";

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function toCents(value: number) {
  return Math.round(roundAmount(value) * 100);
}

function fromCents(value: number) {
  return roundAmount(value / 100);
}

function sumAmounts(values: number[]) {
  return roundAmount(values.reduce((sum, value) => sum + value, 0));
}

function parseAmount(raw: string) {
  const normalized = raw.replace(/,/g, "").trim();
  const value = Number(normalized);
  if (!Number.isFinite(value)) return 0;
  const rounded = roundAmount(value);
  return rounded >= 20 && rounded <= 100000 ? rounded : 0;
}

function extractFromRow(row: OcrRow): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];
  const seen = new Set<string>();
  const text = row.text || "";

  // Dumb approach: find any currency symbol ($, ฿, THB) followed by digits
  const currencyRe = /(?:\u0e3f|THB|\$)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
  let match: RegExpExecArray | null;

  while ((match = currencyRe.exec(text))) {
    const amount = parseAmount(match[1]);
    if (!amount) continue;
    const key = `${row.id}:${amount.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ amount, text: row.text, rowId: row.id, bbox: row.bbox });
  }

  return candidates;
}

/**
 * Per-order amount trust signal (see docs/REDESIGN_PLAN.md §4.1). Replaces the
 * binary per-screenshot multiset verdict (bug B1) — each card is judged alone.
 *   verified — the model's amount appears as a number token in this screenshot's OCR
 *   weak     — an amount is present but OCR could not corroborate it
 *   missing  — the model returned no usable amount
 */
export function verifyOrderAmount(input: {
  totalAmount: number;
  ocrRows: OcrRow[];
  ocrAvailable: boolean;
}): "verified" | "weak" | "missing" {
  if (!(input.totalAmount > 0)) return "missing";
  if (!input.ocrAvailable || input.ocrRows.length === 0) return "weak";
  const cents = Math.round(input.totalAmount * 100);
  const text = input.ocrRows.map((row) => row.text).join("  ");
  for (const token of text.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g)) {
    const value = Number(token[0].replace(/,/g, ""));
    if (Number.isFinite(value) && Math.round(value * 100) === cents) return "verified";
  }
  return "weak";
}

export function scanAmountCandidates(rows: OcrRow[]) {
  return rows.flatMap(extractFromRow).sort((a, b) => {
    const ay = a.bbox?.y ?? 0;
    const by = b.bbox?.y ?? 0;
    return ay - by || a.amount - b.amount;
  });
}

function multisetDiff(left: number[], right: number[]) {
  const counts = new Map<number, number>();
  for (const value of right) counts.set(value, (counts.get(value) ?? 0) + 1);
  const missing: number[] = [];

  for (const value of left) {
    const count = counts.get(value) ?? 0;
    if (count > 0) {
      counts.set(value, count - 1);
    } else {
      missing.push(value);
    }
  }

  return missing.map(fromCents);
}

export function compareAmounts(input: {
  aiCandidates: AmountCandidate[];
  scannerCandidates: AmountCandidate[];
}): AmountCheck {
  const aiCents = input.aiCandidates.map((candidate) => toCents(candidate.amount)).sort((a, b) => a - b);
  const scannerCents = input.scannerCandidates.map((candidate) => toCents(candidate.amount)).sort((a, b) => a - b);
  const missingFromAi = multisetDiff(scannerCents, aiCents);
  const missingFromScanner = multisetDiff(aiCents, scannerCents);
  const aiAmounts = aiCents.map(fromCents);
  const scannerAmounts = scannerCents.map(fromCents);
  const reasons: string[] = [];

  if (aiAmounts.length === 0) reasons.push("ai_amount_unavailable");
  if (scannerAmounts.length === 0) reasons.push("amount_scan_unavailable");
  if (aiAmounts.length !== scannerAmounts.length) reasons.push("amount_count_mismatch");
  if (missingFromAi.length > 0 || missingFromScanner.length > 0) reasons.push("amount_mismatch");

  const state = aiAmounts.length === 0 || scannerAmounts.length === 0
    ? "unavailable"
    : missingFromAi.length === 0 && missingFromScanner.length === 0
      ? "matched"
      : "mismatch";

  return {
    state,
    aiAmounts,
    scannerAmounts,
    missingFromAi,
    missingFromScanner,
    sumAi: sumAmounts(aiAmounts),
    sumScanner: sumAmounts(scannerAmounts),
    reasons,
    aiCandidates: input.aiCandidates,
    scannerCandidates: input.scannerCandidates
  };
}
