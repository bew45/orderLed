import React from "react";
import { StatusBadge } from "./StatusBadge";
import { IconChevronRight } from "./Icons";
import { OrderRow, STATUS_COLOR_VAR, APP_COLOR, formatCurrency } from "./types";

export interface OrderReviewCardProps {
  order: OrderRow;
  onPress?: (order: OrderRow) => void;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 85) return "var(--ol-green)";
  if (confidence >= 60) return "var(--ol-amber)";
  return "var(--ol-red)";
}

/**
 * Mobile order row card: restaurant, source app, date/time, amount,
 * status, OCR confidence, and a tap target to open OrderEditSheet.
 * A colored margin tab (keyed to status) echoes a ledger's tabbed dividers.
 */
export function OrderReviewCard({ order, onPress }: OrderReviewCardProps) {
  const {
    restaurant,
    app,
    dateTimeLabel,
    amount,
    currency,
    status,
    confidence,
  } = order;

  const isVoid = status === "cancelled" || status === "refunded";
  const accent = `var(${STATUS_COLOR_VAR[status]})`;

  return (
    <button
      type="button"
      className="ol-order-card ol-order-card--pressable"
      onClick={() => onPress?.(order)}
    >
      <span className="ol-order-card__tab" style={{ background: accent }} />
      <div className="ol-order-card__main">
        <div className="ol-order-card__row1">
          <span className="ol-order-card__restaurant">{restaurant}</span>
          <span className={`ol-order-card__amount ol-tabular ${isVoid ? "ol-order-card__amount--void" : ""}`}>
            {formatCurrency(amount, currency)}
          </span>
        </div>

        <div className="ol-order-card__row2">
          <span className="ol-order-card__app">
            <span className="ol-order-card__app-dot" style={{ background: APP_COLOR[app] }} />
            {app}
          </span>
          <span className="ol-order-card__sep">·</span>
          <span>{dateTimeLabel}</span>
        </div>

        <div className="ol-order-card__row3">
          <StatusBadge status={status} />
          <span className="ol-confidence">
            <span className="ol-confidence__bar">
              <span
                className="ol-confidence__fill"
                style={{ width: `${confidence}%`, background: confidenceColor(confidence) }}
              />
            </span>
            {confidence}%
          </span>
        </div>
      </div>
      <span className="ol-order-card__chevron">
        <IconChevronRight width={18} height={18} />
      </span>
    </button>
  );
}

export default OrderReviewCard;

/* ---------------------------------------------------------------------------
 * Example usage:
 *
 * <div className="ol-stack">
 *   {mockOrders.map((order) => (
 *     <OrderReviewCard key={order.id} order={order} onPress={setActiveOrder} />
 *   ))}
 * </div>
 * ------------------------------------------------------------------------- */
