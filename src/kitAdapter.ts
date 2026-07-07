import { fmtDateTime, SOURCE_APP_LABEL, type OrderRow as ApiOrderRow, type ProviderModel } from "./api";
import type { ModelInfo, OrderRow as KitOrderRow, OrderStatus as KitOrderStatus, SourceApp as KitSourceApp } from "./kit/components/types";

export function toKitSourceApp(value: string): KitSourceApp {
  const label = SOURCE_APP_LABEL[value] ?? value;
  if (label === "Grab") return "Grab";
  if (label === "LINE MAN") return "LINE MAN";
  if (label === "ShopeeFood") return "ShopeeFood";
  return "Unknown";
}

export function toKitStatus(order: ApiOrderRow): KitOrderStatus {
  if (order.review_state === "needs_review") return "needs_review";
  if (order.review_state === "corrected") return "corrected";
  if (order.status === "completed" || order.status === "cancelled" || order.status === "refunded" || order.status === "unknown") {
    return order.status;
  }
  return "unknown";
}

export function toKitOrder(order: ApiOrderRow): KitOrderRow {
  return {
    id: order.id,
    restaurant: order.restaurant_name || "Unknown restaurant",
    app: toKitSourceApp(order.source_app),
    dateTimeLabel: fmtDateTime(order.ordered_at) || "Unknown date",
    amount: Number(order.net_amount || order.total_amount || 0),
    currency: "THB",
    status: toKitStatus(order),
    confidence: Math.round(Math.max(0, Math.min(1, Number(order.confidence || 0))) * 100),
    refundAmount: Number(order.refund_amount || 0),
    items: order.items_text
      ? order.items_text.split(/\r?\n|,\s*/).filter(Boolean).map((name, index) => ({
          id: `${order.id}-item-${index}`,
          name,
          qty: 1,
          price: 0
        }))
      : []
  };
}

export function toModelInfo(model: ProviderModel, favoriteIds: string[]): ModelInfo {
  return {
    id: model.id,
    name: model.name || model.id,
    provider: "OpenRouter",
    description: [
      model.id,
      model.context_length ? `${model.context_length.toLocaleString()} context` : ""
    ].filter(Boolean).join(" - "),
    isFavorite: favoriteIds.includes(model.id)
  };
}
