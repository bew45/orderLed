/**
 * Shared types for the OrderLedger component kit.
 * These describe the shape of mock data the components expect —
 * copy them alongside the components, or replace with your real
 * app-level types (keep the field names to avoid prop churn).
 */

export type OrderStatus =
  | "completed"
  | "cancelled"
  | "refunded"
  | "unknown"
  | "needs_review"
  | "corrected";

export type SourceApp =
  | "Grab"
  | "LINE MAN"
  | "ShopeeFood"
  | "Unknown";

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  price: number;
}

export interface OrderRow {
  id: string;
  restaurant: string;
  app: SourceApp;
  dateTimeLabel: string; // pre-formatted, e.g. "7 ก.ค. 2026 · 12:41"
  amount: number;
  currency?: string; // default "THB"
  status: OrderStatus;
  confidence: number; // 0–100
  refundAmount?: number;
  items?: OrderItem[];
  thumbnailColor?: string; // fallback swatch when no real thumbnail
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  isFavorite: boolean;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  unknown: "Unknown",
  needs_review: "Needs review",
  corrected: "Corrected",
};

/** CSS color token (var name) keyed by status — used for tabs/dots/fills. */
export const STATUS_COLOR_VAR: Record<OrderStatus, string> = {
  completed: "--ol-green",
  cancelled: "--ol-red",
  refunded: "--ol-plum",
  unknown: "--ol-gray",
  needs_review: "--ol-amber",
  corrected: "--ol-blue",
};

export const APP_COLOR: Record<SourceApp, string> = {
  Grab: "#0a8a3f",
  "LINE MAN": "#4a4038",
  ShopeeFood: "#ee4d2d",
  Unknown: "#5c6660",
};

export function formatCurrency(amount: number, currency = "THB"): string {
  const symbol = currency === "THB" ? "฿" : currency + " ";
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
