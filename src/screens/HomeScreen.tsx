import React, { useMemo, useState } from "react";
import { endpoints, fmtDateTime, fmtMoney, fmtMonthLabel, SOURCE_APP_LABEL, STATUS_LABEL, type OrderRow } from "../api";
import { useAppData } from "../state/AppData";
import { Badge, EmptyState, IconInbox, PrimaryButton, StatCard } from "../components/ui";

type AggregateRow = {
  key: string;
  label: string;
  count: number;
  amount: number;
};

function money(value: number) {
  return `THB ${fmtMoney(value)}`;
}

function orderAmount(order: Pick<OrderRow, "net_amount" | "total_amount">) {
  return Number(order.net_amount || order.total_amount || 0);
}

function orderMonth(order: Pick<OrderRow, "ordered_at">) {
  return /^\d{4}-\d{2}/.test(order.ordered_at || "") ? order.ordered_at.slice(0, 7) : "unknown";
}

function monthLabel(month: string) {
  return month === "unknown" ? "Unknown month" : fmtMonthLabel(month);
}

function firstItem(itemsText: string) {
  const first = itemsText
    .split(/\r?\n|,\s*/)
    .map((item) => item.trim())
    .filter(Boolean)[0];
  return first || "No item text yet";
}

function isMonthlyTotalSnapshot(order: OrderRow) {
  return order.duplicate_key.startsWith("legacy-monthly-total:");
}

function summarizeOrders(orders: OrderRow[]) {
  const netSpend = orders.reduce((sum, order) => sum + orderAmount(order), 0);
  const completedSpend = orders
    .filter((order) => order.status === "completed")
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  return {
    netSpend,
    completedSpend,
    ordersTotal: orders.length,
    needsCheck: orders.filter((order) => order.review_state === "needs_review").length
  };
}

function aggregate(orders: OrderRow[], pick: (order: OrderRow) => { key: string; label: string }) {
  const map = new Map<string, AggregateRow>();
  for (const order of orders) {
    const { key, label } = pick(order);
    const current = map.get(key) ?? { key, label, count: 0, amount: 0 };
    current.count += 1;
    current.amount += orderAmount(order);
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
}

export function HomeScreen(props: { onUpload: () => void; onCreateBatch: () => void }) {
  const { activeBatch, summary, orders, screenshots } = useAppData();
  const [selectedMonth, setSelectedMonth] = useState("all");

  const dashboard = useMemo(() => {
    const isMonthlyTotalBatch = orders.length > 0 && orders.every(isMonthlyTotalSnapshot);
    const monthly = aggregate(orders, (order) => {
      const month = orderMonth(order);
      return { key: month, label: monthLabel(month) };
    }).sort((a, b) => a.key.localeCompare(b.key));
    const months = monthly.map((row) => row.key);
    const filteredOrders = selectedMonth === "all"
      ? orders
      : orders.filter((order) => orderMonth(order) === selectedMonth);
    const totals = summarizeOrders(filteredOrders);

    return {
      months,
      monthly,
      isMonthlyTotalBatch,
      filteredOrders,
      totals,
      restaurants: aggregate(filteredOrders, (order) => ({
        key: order.restaurant_name || "Unknown restaurant",
        label: order.restaurant_name || "Unknown restaurant"
      })),
      apps: aggregate(filteredOrders, (order) => ({
        key: order.source_app || "unknown",
        label: SOURCE_APP_LABEL[order.source_app] ?? order.source_app ?? "Unknown"
      })),
      statuses: aggregate(filteredOrders, (order) => ({
        key: order.status || "unknown",
        label: STATUS_LABEL[order.status] ?? order.status ?? "Unknown"
      })),
      recent: [...filteredOrders].sort((a, b) => {
        const aTime = new Date(a.ordered_at || 0).getTime();
        const bTime = new Date(b.ordered_at || 0).getTime();
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      })
    };
  }, [orders, selectedMonth]);

  if (!activeBatch) {
    return (
      <div className="screen">
        <EmptyState
          icon={<IconInbox size={24} />}
          title="Start an import"
          body="Create an import, then upload delivery screenshots from Grab, LINE MAN, or ShopeeFood."
        >
          <PrimaryButton onClick={props.onCreateBatch}>Create import</PrimaryButton>
        </EmptyState>
      </div>
    );
  }

  const hasScreenshots = (summary?.screenshotsTotal ?? 0) > 0;
  const hasOrders = orders.length > 0;
  const currentLabel = selectedMonth === "all" ? "All detected months" : monthLabel(selectedMonth);
  const rowLabel = dashboard.isMonthlyTotalBatch ? "monthly total" : "order";
  const rowLabelPlural = dashboard.isMonthlyTotalBatch ? "monthly totals" : "orders";

  return (
    <div className="screen">
      <div>
        <p className="eyebrow">Import Summary</p>
        <h2 className="screen-title">{activeBatch.title}</h2>
      </div>

      <section className="dashboard-hero">
        <span className="dashboard-hero-label">{currentLabel}</span>
        <strong className="dashboard-hero-total tabular">{money(dashboard.totals.netSpend)}</strong>
        <span className="dashboard-hero-meta">
          {dashboard.totals.ordersTotal} {rowLabelPlural} / {dashboard.months.length} month{dashboard.months.length === 1 ? "" : "s"}
          {dashboard.isMonthlyTotalBatch ? "" : ` / ${dashboard.restaurants.length} restaurant${dashboard.restaurants.length === 1 ? "" : "s"}`}
        </span>
      </section>

      <div className="stat-grid">
        <StatCard label="Net spend" value={money(dashboard.totals.netSpend)} />
        <StatCard label="Completed" value={money(dashboard.totals.completedSpend)} />
        <StatCard label={dashboard.isMonthlyTotalBatch ? "Rows" : "Orders"} value={String(dashboard.totals.ordersTotal)} />
        <StatCard label="Needs check" value={String(dashboard.totals.needsCheck)} tone={dashboard.totals.needsCheck > 0 ? "warn" : undefined} />
      </div>

      <div className="home-status-line">
        {dashboard.isMonthlyTotalBatch
          ? "Legacy monthly totals imported as summary rows. New screenshot imports will still extract restaurant-level orders."
          : hasScreenshots
          ? `Import: ${summary?.screenshotsTotal} screenshots / ${summary?.screenshotsProcessed} processed / ${summary?.screenshotsFailed} failed`
          : "No screenshots uploaded yet for this import."}
      </div>

      <div className="home-cta-stack">
        <PrimaryButton block onClick={props.onUpload}>Upload screenshots</PrimaryButton>
      </div>

      {screenshots.length > 0 && (
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h3>Uploaded screenshots</h3>
            <span>{screenshots.length} image{screenshots.length === 1 ? "" : "s"}</span>
          </div>
          <div className="uploaded-shot-list">
            {screenshots.slice(0, 12).map((shot) => (
              <a className="uploaded-shot" key={shot.id} href={endpoints.screenshotImageUrl(shot.id)} target="_blank" rel="noreferrer">
                <span className="uploaded-shot-thumb">
                  <img src={endpoints.screenshotImageUrl(shot.id)} alt={shot.original_name} loading="lazy" />
                </span>
                <span className="uploaded-shot-info">
                  <strong>{shot.original_name}</strong>
                  <small>{shot.width || 0} x {shot.height || 0} / {shot.error ? "Failed" : shot.processed_at > 0 ? "Read" : "Uploaded"}</small>
                </span>
                <span className={shot.error ? "uploaded-shot-status is-failed" : "uploaded-shot-status"}>
                  {shot.error ? "Failed" : shot.processed_at > 0 ? "Read" : "Open"}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {!hasOrders ? (
        <EmptyState
          icon={<IconInbox size={22} />}
          title="No orders summarized yet"
          body="Upload screenshots and OrderLedger will build the dashboard automatically."
        />
      ) : (
        <>
          <section className="dashboard-section">
            <div className="dashboard-section-head">
              <h3>Detected months</h3>
              <span>{dashboard.months.length} found</span>
            </div>
            <div className="month-chip-row">
              <button className={selectedMonth === "all" ? "chip active" : "chip"} onClick={() => setSelectedMonth("all")}>All</button>
              {dashboard.months.map((month) => (
                <button key={month} className={selectedMonth === month ? "chip active" : "chip"} onClick={() => setSelectedMonth(month)}>
                  {monthLabel(month)}
                </button>
              ))}
            </div>
            <div className="dashboard-list">
              {dashboard.monthly.map((row) => (
                <div className="dashboard-rank-row" key={row.key}>
                  <span className="dashboard-row-main">
                    <strong>{row.label}</strong>
                    <small>{row.count} {row.count === 1 ? rowLabel : rowLabelPlural}</small>
                  </span>
                  <span className="dashboard-row-money tabular">{money(row.amount)}</span>
                </div>
              ))}
            </div>
          </section>

          {!dashboard.isMonthlyTotalBatch && (
            <>
              <section className="dashboard-section">
                <div className="dashboard-section-head">
                  <h3>Restaurants</h3>
                  <span>{dashboard.restaurants.length} found</span>
                </div>
                <div className="dashboard-list">
                  {dashboard.restaurants.slice(0, 10).map((row, index) => (
                    <div className="dashboard-rank-row" key={row.key}>
                      <span className="dashboard-rank tabular">{index + 1}</span>
                      <span className="dashboard-row-main">
                        <strong>{row.label}</strong>
                        <small>{row.count} order{row.count === 1 ? "" : "s"}</small>
                      </span>
                      <span className="dashboard-row-money tabular">{money(row.amount)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="dashboard-grid-two">
                <div className="dashboard-section">
                  <div className="dashboard-section-head">
                    <h3>Apps</h3>
                  </div>
                  <div className="dashboard-list compact">
                    {dashboard.apps.map((row) => (
                      <div className="dashboard-mini-row" key={row.key}>
                        <span>{row.label}</span>
                        <strong className="tabular">{row.count}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="dashboard-section">
                  <div className="dashboard-section-head">
                    <h3>Status</h3>
                  </div>
                  <div className="dashboard-list compact">
                    {dashboard.statuses.map((row) => (
                      <div className="dashboard-mini-row" key={row.key}>
                        <span>{row.label}</span>
                        <strong className="tabular">{row.count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          <section className="dashboard-section">
            <div className="dashboard-section-head">
              <h3>{dashboard.isMonthlyTotalBatch ? "Monthly totals" : "Orders"}</h3>
              <span>{dashboard.filteredOrders.length} rows</span>
            </div>
            <div className="dashboard-order-list">
              {dashboard.recent.slice(0, 15).map((order) => (
                <article className="dashboard-order" key={order.id}>
                  <div className="dashboard-order-top">
                    <strong>{order.restaurant_name || "Unknown restaurant"}</strong>
                    <span className="dashboard-row-money tabular">{money(orderAmount(order))}</span>
                  </div>
                  <div className="dashboard-order-item">{firstItem(order.items_text)}</div>
                  <div className="dashboard-order-meta">
                    <span>{SOURCE_APP_LABEL[order.source_app] ?? order.source_app ?? "Unknown"}</span>
                    <span>{fmtDateTime(order.ordered_at) || "Unknown time"}</span>
                    <Badge status={order.review_state !== "ok" ? order.review_state : order.status} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
