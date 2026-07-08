import React, { useMemo, useState } from "react";
import { fmtDateTime, fmtMoney, SOURCE_APP_COLOR, SOURCE_APP_LABEL, type OrderRow } from "../api";
import { useAppData } from "../state/AppData";
import { Badge, EmptyState, IconInbox } from "../components/ui";
import { OrderSheet } from "../components/OrderSheet";

const REVIEW_ORDER: Record<string, number> = { needs_check: 0, corrected: 1, ok: 2 };

export function ReviewScreen() {
  const { orders, activeBatch } = useAppData();
  const [filter, setFilter] = useState<"all" | "needs_check">("all");
  const [openOrderId, setOpenOrderId] = useState<string>("");

  const sorted = useMemo(() => {
    const list = filter === "needs_check" ? orders.filter((o) => o.review_state === "needs_check") : orders;
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
          <button className={filter === "needs_check" ? "chip active" : "chip"} onClick={() => setFilter("needs_check")}>Needs check</button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<IconInbox size={24} />}
          title="Nothing to review"
          body={filter === "needs_check" ? "No rows currently need checking." : "Upload and process screenshots to see orders here."}
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
      </div>
    </button>
  );
}
