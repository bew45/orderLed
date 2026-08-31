import { parseJson } from "./json";
import type { OrderFlag } from "./types";

/** Codes that force review_tier === "blocked" (see docs/REDESIGN_PLAN.md §4.2). */
export const BLOCKING_FLAG_CODES = new Set([
  "amount_missing",
  "dup_conflict",
  "card_partial",
  "date_relative",
  "multi_weak",
  "orphaned"
]);

export function parseFlags(raw: string | null | undefined): OrderFlag[] {
  const value = parseJson<unknown>(raw, []);
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is OrderFlag => Boolean(f) && typeof (f as OrderFlag).code === "string")
    .map((f) => ({
      code: String(f.code),
      field: String(f.field ?? ""),
      severity: f.severity === "block" || f.severity === "warn" ? f.severity : "info",
      detail: f.detail ? String(f.detail) : undefined
    }));
}

export function serializeFlags(flags: OrderFlag[]): string {
  return JSON.stringify(flags ?? []);
}

export function withFlag(raw: string | null | undefined, flag: OrderFlag): string {
  const flags = parseFlags(raw).filter((f) => f.code !== flag.code);
  flags.push(flag);
  return serializeFlags(flags);
}

export function tierFromFlags(flags: OrderFlag[]): "clean" | "review" | "blocked" {
  if (flags.some((f) => f.severity === "block" || BLOCKING_FLAG_CODES.has(f.code))) return "blocked";
  if (flags.length > 0) return "review";
  return "clean";
}
