import React, { useMemo, useState } from "react";
import {
  fmtDateTime,
  fmtMoney,
  fmtMonthLabel,
  SOURCE_APP_COLOR,
  SOURCE_APP_LABEL,
  STATUS_LABEL,
  type OrderRow
} from "../api";
import { useAppData } from "../state/AppData";
import { Badge, EmptyState, IconInbox, PrimaryButton } from "../components/ui";

type AggregateRow = {
  key: string;
  label: string;
  count: number;
  amount: number;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function baht(value: number) {
  return `฿${fmtMoney(value)}`;
}

function bahtRound(value: number) {
  return `฿${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(Math.round(value || 0))}`;
}

function bahtCompact(value: number) {
  if (Math.abs(value) >= 10000) return `฿${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k`;
  return bahtRound(value);
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

function monthShortLabel(month: string) {
  if (month === "unknown") return "?";
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
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

function weekdaySpend(orders: OrderRow[]) {
  const totals = Array(7).fill(0) as number[];
  let hasData = false;
  for (const order of orders) {
    const date = new Date(order.ordered_at || "");
    if (Number.isNaN(date.getTime())) continue;
    const index = (date.getDay() + 6) % 7; // Monday-first
    totals[index] += orderAmount(order);
    hasData = true;
  }
  return hasData ? totals : null;
}

const APP_ORDER = ["grab", "lineman", "shopeefood", "unknown"];

export function HomeScreen(props: { onCreateBatch: () => void; onOpenImport: () => void }) {
  const { batches, allOrders } = useAppData();
  const [selectedMonth, setSelectedMonth] = useState("all");

  const dashboard = useMemo(() => {
    const isMonthlyTotalBatch = allOrders.length > 0 && allOrders.every(isMonthlyTotalSnapshot);
    const monthly = aggregate(allOrders, (order) => {
      const month = orderMonth(order);
      return { key: month, label: monthLabel(month) };
    }).sort((a, b) => a.key.localeCompare(b.key));
    const months = monthly.map((row) => row.key);
    const filteredOrders = selectedMonth === "all"
      ? allOrders
      : allOrders.filter((order) => orderMonth(order) === selectedMonth);

    const netSpend = filteredOrders.reduce((sum, order) => sum + orderAmount(order), 0);
    const completedSpend = filteredOrders
      .filter((order) => order.status === "completed")
      .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const lostToRefunds = filteredOrders
      .filter((order) => order.status === "refunded" || order.status === "cancelled")
      .reduce((sum, order) => sum + Number(order.total_amount || 0) - orderAmount(order), 0);
    const needsCheck = filteredOrders.filter((order) => order.review_state === "needs_check").length;
    const avgPerOrder = filteredOrders.length > 0 ? netSpend / filteredOrders.length : 0;

    // Delta vs previous month (only when one month is selected and the previous exists)
    let delta: { pct: number; label: string } | null = null;
    if (selectedMonth !== "all") {
      const index = months.indexOf(selectedMonth);
      const previous = index > 0 ? monthly[index - 1] : null;
      if (previous && previous.key !== "unknown" && previous.amount > 0) {
        const current = monthly[index]?.amount ?? 0;
        delta = {
          pct: ((current - previous.amount) / previous.amount) * 100,
          label: monthShortLabel(previous.key)
        };
      }
    }

    const restaurants = aggregate(filteredOrders, (order) => ({
      key: order.restaurant_name || "Unknown restaurant",
      label: order.restaurant_name || "Unknown restaurant"
    }));

    const apps = aggregate(filteredOrders, (order) => ({
      key: order.source_app || "unknown",
      label: SOURCE_APP_LABEL[order.source_app] ?? order.source_app ?? "Unknown"
    })).sort((a, b) => APP_ORDER.indexOf(a.key) - APP_ORDER.indexOf(b.key));

    const biggestOrder = [...filteredOrders].sort((a, b) => orderAmount(b) - orderAmount(a))[0] ?? null;
    const favorite = [...restaurants].sort((a, b) => b.count - a.count || b.amount - a.amount)[0] ?? null;
    const weekdays = weekdaySpend(filteredOrders);

    return {
      months,
      monthly,
      isMonthlyTotalBatch,
      filteredOrders,
      totals: { netSpend, completedSpend, lostToRefunds, needsCheck, avgPerOrder, ordersTotal: filteredOrders.length },
      delta,
      restaurants,
      apps,
      biggestOrder,
      favorite,
      weekdays,
      recent: [...filteredOrders].sort((a, b) => {
        const aTime = new Date(a.ordered_at || 0).getTime();
        const bTime = new Date(b.ordered_at || 0).getTime();
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      })
    };
  }, [allOrders, selectedMonth]);

  if (batches.length === 0) {
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

  const hasOrders = allOrders.length > 0;
  const rowLabel = dashboard.isMonthlyTotalBatch ? "monthly total" : "order";
  const rowLabelPlural = dashboard.isMonthlyTotalBatch ? "monthly totals" : "orders";
  const trendMax = Math.max(...dashboard.monthly.map((row) => row.amount), 1);
  const appTotal = Math.max(dashboard.apps.reduce((sum, row) => sum + row.amount, 0), 1);
  const restMax = Math.max(...dashboard.restaurants.slice(0, 8).map((row) => row.amount), 1);
  const weekdayMax = dashboard.weekdays ? Math.max(...dashboard.weekdays, 1) : 1;

  return (
    <div className="screen">
      <div>
        <p className="eyebrow">Dashboard</p>
        <h2 className="screen-title">Spending overview</h2>
        <p className="screen-subtitle">
          {batches.length} import{batches.length === 1 ? "" : "s"} combined into one running history.
        </p>
      </div>

      {!hasOrders ? (
        <EmptyState
          icon={<IconInbox size={22} />}
          title="No dashboard yet"
          body="Go to Import to upload or retry reading screenshots. Dashboard appears after orders are extracted."
        >
          <PrimaryButton onClick={props.onOpenImport}>Open Import</PrimaryButton>
        </EmptyState>
      ) : (
        <>
          <section className="dash-hero" aria-label="Total spend">
            <div className="dash-hero-top">
              <span className="dash-hero-label">
                {selectedMonth === "all" ? "All months" : monthLabel(selectedMonth)} · net spend
              </span>
              {dashboard.delta && (
                <span className={dashboard.delta.pct >= 0 ? "dash-delta up" : "dash-delta down"}>
                  {dashboard.delta.pct >= 0 ? "▲" : "▼"} {Math.abs(dashboard.delta.pct).toFixed(0)}% vs {dashboard.delta.label}
                </span>
              )}
            </div>
            <strong className="dash-hero-total tabular">{baht(dashboard.totals.netSpend)}</strong>
            <span className="dash-hero-meta">
              {dashboard.totals.ordersTotal} {dashboard.totals.ordersTotal === 1 ? rowLabel : rowLabelPlural}
              {dashboard.isMonthlyTotalBatch ? "" : ` · ${dashboard.restaurants.length} restaurant${dashboard.restaurants.length === 1 ? "" : "s"}`}
              {dashboard.totals.ordersTotal > 0 && !dashboard.isMonthlyTotalBatch
                ? ` · avg ${bahtRound(dashboard.totals.avgPerOrder)}`
                : ""}
            </span>
          </section>

          {dashboard.monthly.length > 1 && (
            <section className="dashboard-section" aria-label="Monthly trend">
              <div className="dashboard-section-head">
                <h3>Monthly trend</h3>
                <button
                  className={selectedMonth === "all" ? "chip active" : "chip"}
                  onClick={() => setSelectedMonth("all")}
                >
                  All months
                </button>
              </div>
              <div className="dash-trend" role="group" aria-label="Spend by month, tap to filter">
                {dashboard.monthly.map((row) => {
                  const selected = selectedMonth === row.key;
                  const isMax = row.amount === trendMax;
                  return (
                    <button
                      key={row.key}
                      className={selected ? "dash-trend-col selected" : "dash-trend-col"}
                      onClick={() => setSelectedMonth(selected ? "all" : row.key)}
                      aria-pressed={selected}
                      title={`${row.label}: ${baht(row.amount)} · ${row.count} ${row.count === 1 ? rowLabel : rowLabelPlural}`}
                    >
                      <span className="dash-trend-value tabular">
                        {(selected || (isMax && selectedMonth === "all")) ? bahtCompact(row.amount) : " "}
                      </span>
                      <span className="dash-trend-track">
                        <span
                          className="dash-trend-fill"
                          style={{ height: `${Math.max(4, Math.round((row.amount / trendMax) * 100))}%` }}
                        />
                      </span>
                      <span className="dash-trend-month">{monthShortLabel(row.key)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <div className="dash-stat-grid">
            <div className="dash-stat">
              <span className="dash-stat-label">Completed</span>
              <strong className="dash-stat-value tabular">{bahtRound(dashboard.totals.completedSpend)}</strong>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-label">{dashboard.isMonthlyTotalBatch ? "Rows" : "Orders"}</span>
              <strong className="dash-stat-value tabular">{dashboard.totals.ordersTotal}</strong>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-label">Refund / cancel</span>
              <strong className="dash-stat-value tabular">{bahtRound(dashboard.totals.lostToRefunds)}</strong>
            </div>
            <div className={dashboard.totals.needsCheck > 0 ? "dash-stat warn" : "dash-stat"}>
              <span className="dash-stat-label">Needs check</span>
              <strong className="dash-stat-value tabular">{dashboard.totals.needsCheck}</strong>
            </div>
          </div>

          {!dashboard.isMonthlyTotalBatch && dashboard.apps.length > 0 && (
            <section className="dashboard-section" aria-label="Spend by app">
              <div className="dashboard-section-head">
                <h3>By app</h3>
                <span>{dashboard.apps.length} app{dashboard.apps.length === 1 ? "" : "s"}</span>
              </div>
              <div className="dash-stack" role="img" aria-label={dashboard.apps.map((row) => `${row.label} ${baht(row.amount)}`).join(", ")}>
                {dashboard.apps.filter((row) => row.amount > 0).map((row) => (
                  <span
                    key={row.key}
                    className="dash-stack-seg"
                    style={{
                      width: `${Math.max(1.5, (row.amount / appTotal) * 100)}%`,
                      background: SOURCE_APP_COLOR[row.key] ?? SOURCE_APP_COLOR.unknown
                    }}
                  />
                ))}
              </div>
              <div className="dash-app-list">
                {dashboard.apps.map((row) => (
                  <div className="dash-app-row" key={row.key}>
                    <span className="dash-dot" style={{ background: SOURCE_APP_COLOR[row.key] ?? SOURCE_APP_COLOR.unknown }} />
                    <span className="dash-app-name">{row.label}</span>
                    <small>{row.count} order{row.count === 1 ? "" : "s"}</small>
                    <span className="dash-app-amount tabular">{bahtRound(row.amount)}</span>
                    <small className="dash-app-pct tabular">{Math.round((row.amount / appTotal) * 100)}%</small>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!dashboard.isMonthlyTotalBatch && dashboard.restaurants.length > 0 && (
            <section className="dashboard-section" aria-label="Top restaurants">
              <div className="dashboard-section-head">
                <h3>Top restaurants</h3>
                <span>{dashboard.restaurants.length} found</span>
              </div>
              <div className="dash-rest-list">
                {dashboard.restaurants.slice(0, 8).map((row, index) => (
                  <div className="dash-rest-row" key={row.key}>
                    <span className="dash-rest-rank tabular">{index + 1}</span>
                    <span className="dash-rest-main">
                      <span className="dash-rest-name-line">
                        <strong>{row.label}</strong>
                        <span className="dash-rest-amount tabular">{bahtRound(row.amount)}</span>
                      </span>
                      <span className="dash-rest-track">
                        <span className="dash-rest-fill" style={{ width: `${Math.max(2, Math.round((row.amount / restMax) * 100))}%` }} />
                      </span>
                      <small>{row.count} order{row.count === 1 ? "" : "s"}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!dashboard.isMonthlyTotalBatch && (dashboard.biggestOrder || dashboard.favorite) && (
            <div className="dash-insight-row">
              {dashboard.biggestOrder && (
                <div className="dash-insight">
                  <span className="dash-insight-label">Biggest order</span>
                  <strong className="tabular">{bahtRound(orderAmount(dashboard.biggestOrder))}</strong>
                  <small>{dashboard.biggestOrder.restaurant_name || "Unknown restaurant"}</small>
                </div>
              )}
              {dashboard.favorite && (
                <div className="dash-insight">
                  <span className="dash-insight-label">Ordered most</span>
                  <strong>{dashboard.favorite.count}×</strong>
                  <small>{dashboard.favorite.label}</small>
                </div>
              )}
            </div>
          )}

          {!dashboard.isMonthlyTotalBatch && dashboard.weekdays && (
            <section className="dashboard-section" aria-label="Spend by weekday">
              <div className="dashboard-section-head">
                <h3>By weekday</h3>
              </div>
              <div className="dash-week" role="img" aria-label={dashboard.weekdays.map((amount, i) => `${WEEKDAY_LABELS[i]} ${baht(amount)}`).join(", ")}>
                {dashboard.weekdays.map((amount, index) => (
                  <span className="dash-week-col" key={WEEKDAY_LABELS[index]} title={`${WEEKDAY_LABELS[index]}: ${baht(amount)}`}>
                    <span className="dash-week-track">
                      <span
                        className={amount === weekdayMax ? "dash-week-fill max" : "dash-week-fill"}
                        style={{ height: `${Math.max(3, Math.round((amount / weekdayMax) * 100))}%` }}
                      />
                    </span>
                    <small>{WEEKDAY_LABELS[index]}</small>
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="dashboard-section" aria-label="Recent orders">
            <div className="dashboard-section-head">
              <h3>{dashboard.isMonthlyTotalBatch ? "Monthly totals" : "Recent orders"}</h3>
              <span>{dashboard.filteredOrders.length} rows</span>
            </div>
            <div className="dash-order-list">
              {dashboard.recent.slice(0, 12).map((order) => (
                <article className="dash-order" key={order.id}>
                  <span className="dash-order-app" style={{ background: SOURCE_APP_COLOR[order.source_app] ?? SOURCE_APP_COLOR.unknown }} />
                  <div className="dash-order-body">
                    <div className="dash-order-top">
                      <strong>{order.restaurant_name || "Unknown restaurant"}</strong>
                      <span className="dash-order-amount tabular">{baht(orderAmount(order))}</span>
                    </div>
                    <div className="dash-order-item">{firstItem(order.items_text)}</div>
                    <div className="dash-order-meta">
                      <span>{SOURCE_APP_LABEL[order.source_app] ?? order.source_app ?? "Unknown"}</span>
                      <span>{fmtDateTime(order.ordered_at) || "Unknown time"}</span>
                      <Badge status={order.review_state !== "ok" ? order.review_state : order.status} label={order.review_state === "ok" ? STATUS_LABEL[order.status] : undefined} />
                    </div>
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
