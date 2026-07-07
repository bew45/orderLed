import React, { useMemo, useState } from "react";
import { fmtDateTime, fmtMoney, SOURCE_APP_COLOR, SOURCE_APP_LABEL, type OrderRow } from "../api";
import { useAppData } from "../state/AppData";
import { Badge, EmptyState, IconInbox } from "../components/ui";
import { OrderSheet } from "../components/OrderSheet";

const REVIEW_ORDER: Record<string, number> = { needs_review: 0, corrected: 1, ok: 2 };

function confidenceColor(confidence: number): string {
  if (confidence >= 85) return "var(--ok)";
  if (confidence >= 60) return "var(--review)";
  return "var(--danger)";
}

export function ReviewScreen() {
  const { orders, activeBatch } = useAppData();
  const [filter, setFilter] = useState<"all" | "needs_review">("all");
  const [openOrderId, setOpenOrderId] = useState<string>("");

  const sorted = useMemo(() => {
    const list = filter === "needs_review" ? orders.filter((o) => o.review_state === "needs_review") : orders;
    return [...list].sort((a, b) => (REVIEW_ORDER[a.review_state] ?? 3) - (REVIEW_ORDER[b.review_state] ?? 3));
  }, [orders, filter]);

  if (!activeBatch) {
    return (
      <div className="screen">
        <EmptyState icon={<IconInbox size={24} />} title="No batch yet" body="Create a batch and upload screenshots to start reviewing orders." />
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="review-filter-row">
        <h2 className="screen-title">Review</h2>
        <div className="chip-row">
          <button className={filter === "all" ? "chip active" : "chip"} onClick={() => setFilter("all")}>All</button>
          <button className={filter === "needs_review" ? "chip active" : "chip"} onClick={() => setFilter("needs_review")}>Needs review</button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<IconInbox size={24} />}
          title="Nothing to review"
          body={filter === "needs_review" ? "No rows currently need review." : "Upload and process screenshots to see orders here."}
        />
      ) : (
        <div className="stack">
          {sorted.map((order) => (
            <OrderRowCard key={order.id} order={order} onOpen={() => setOpenOrderId(order.id)} />
          ))}
        </div>
      )}

      {openOrderId && <OrderSheet orderId={openOrderId} onClose={() => setOpenOrderId("")} />}
    </div>
  );
}

function OrderRowCard(props: { order: OrderRow; onOpen: () => void }) {
  const { order } = props;
  const isVoid = order.status === "cancelled" || order.status === "refunded";
  return (
    <button className={`order-row ${order.review_state}`} onClick={props.onOpen}>
      <div className="order-row-row1">
        <span className="order-row-restaurant">{order.restaurant_name || "Unknown restaurant"}</span>
        <span className="order-row-amount tabular" style={isVoid ? { color: "var(--ink-faint)", textDecoration: "line-through" } : undefined}>
          ฿{fmtMoney(order.net_amount)}
        </span>
      </div>
      <div className="order-row-row2">
        <span className="order-row-app">
          <span className="order-row-app-dot" style={{ background: SOURCE_APP_COLOR[order.source_app] }} />
          {SOURCE_APP_LABEL[order.source_app] ?? order.source_app}
        </span>
        <span className="order-row-sep">·</span>
        <span>{fmtDateTime(order.ordered_at)}</span>
      </div>
      <div className="order-row-row3">
        <Badge status={order.review_state !== "ok" ? order.review_state : order.status} />
        <span className="confidence">
          <span className="confidence-bar">
            <span
              className="confidence-fill"
              style={{ width: `${Math.round((order.confidence || 0) * 100)}%`, background: confidenceColor((order.confidence || 0) * 100) }}
            />
          </span>
          {Math.round((order.confidence || 0) * 100)}%
        </span>
      </div>
    </button>
  );
}
