import React, { useMemo, useState } from "react";
import { useAppData } from "../state/AppData";
import { EmptyState } from "../kit/components/EmptyState";
import { OrderReviewCard } from "../kit/components/OrderReviewCard";
import { StatusBadge } from "../kit/components/StatusBadge";
import { toKitOrder } from "../kitAdapter";
import { OrderSheet } from "../components/OrderSheet";

const REVIEW_ORDER: Record<string, number> = { needs_review: 0, corrected: 1, ok: 2 };

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
        <EmptyState kind="no_orders" title="No batch yet" description="Create a batch and upload screenshots to start reviewing orders." />
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="review-filter-row">
        <h2 className="screen-title">Review</h2>
        <div className="ol-filter-row">
          <button className={filter === "all" ? "ol-filter-chip active" : "ol-filter-chip"} onClick={() => setFilter("all")}>All</button>
          <button className={filter === "needs_review" ? "ol-filter-chip active" : "ol-filter-chip"} onClick={() => setFilter("needs_review")}>
            <StatusBadge status="needs_review" label="Needs review" />
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          kind="no_orders"
          title={filter === "needs_review" ? "Nothing needs review" : "No orders found"}
          description={filter === "needs_review" ? "No rows currently need review." : "Upload and process screenshots to see orders here."}
        />
      ) : (
        <div className="ol-stack">
          {sorted.map((order) => (
            <OrderReviewCard key={order.id} order={toKitOrder(order)} onPress={() => setOpenOrderId(order.id)} />
          ))}
        </div>
      )}

      {openOrderId && <OrderSheet orderId={openOrderId} onClose={() => setOpenOrderId("")} />}
    </div>
  );
}
