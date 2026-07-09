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
import { Alert, Badge, EmptyState, IconGear, IconInbox, PrimaryButton } from "../components/ui";

type AggregateRow = {
  key: string;
  label: string;
  count: number;
  amount: number;
};

type WeekRow = {
  key: string;
  label: string;
  count: number;
  amount: number;
};

const WEEK_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function money(value: number) {
  return `THB ${fmtMoney(value)}`;
}

function compactMoney(value: number) {
  if (Math.abs(value) >= 1000) return `${fmtMoney(value / 1000)}k`;
  return fmtMoney(value);
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

function validOrderDate(order: OrderRow) {
  const date = new Date(order.ordered_at || "");
  return Number.isNaN(date.getTime()) ? null : date;
}

function summarizeOrders(orders: OrderRow[]) {
  const netSpend = orders.reduce((sum, order) => sum + orderAmount(order), 0);
  const completedSpend = orders
    .filter((order) => order.status === "completed")
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const refundedOrCancelled = orders
    .filter((order) => order.status === "cancelled" || order.status === "refunded")
    .reduce((sum, order) => sum + Math.abs(Number(order.total_amount || 0)), 0);
  return {
    netSpend,
    completedSpend,
    refundedOrCancelled,
    ordersTotal: orders.length,
    needsCheck: orders.filter((order) => order.review_state === "needs_check").length,
    averageOrder: orders.length ? netSpend / orders.length : 0
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

function weekdayRows(orders: OrderRow[]): WeekRow[] {
  const rows = WEEK_LABELS.map((label, index) => ({ key: String(index), label, count: 0, amount: 0 }));
  for (const order of orders) {
    const date = validOrderDate(order);
    if (!date) continue;
    const row = rows[date.getDay()];
    row.count += 1;
    row.amount += orderAmount(order);
  }
  return rows;
}

function mostCommonHour(orders: OrderRow[]) {
  const map = new Map<number, number>();
  for (const order of orders) {
    const date = validOrderDate(order);
    if (!date) continue;
    const hour = date.getHours();
    map.set(hour, (map.get(hour) ?? 0) + 1);
  }
  const best = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) return { label: "Unknown", detail: "No dated orders" };
  const [hour, count] = best;
  return { label: `${String(hour).padStart(2, "0")}:00`, detail: `${count} order${count === 1 ? "" : "s"}` };
}

export function HomeScreen(props: { onCreateBatch: () => void; onOpenImport: () => void; onOpenSettings: () => void }) {
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
    const totals = summarizeOrders(filteredOrders);
    const restaurants = aggregate(filteredOrders, (order) => ({
      key: order.restaurant_name || "Unknown restaurant",
      label: order.restaurant_name || "Unknown restaurant"
    }));
    const apps = aggregate(filteredOrders, (order) => ({
      key: order.source_app || "unknown",
      label: SOURCE_APP_LABEL[order.source_app] ?? order.source_app ?? "Unknown"
    }));
    const statuses = aggregate(filteredOrders, (order) => ({
      key: order.status || "unknown",
      label: STATUS_LABEL[order.status] ?? order.status ?? "Unknown"
    }));
    const recent = [...filteredOrders].sort((a, b) => {
      const aTime = validOrderDate(a)?.getTime() ?? 0;
      const bTime = validOrderDate(b)?.getTime() ?? 0;
      return bTime - aTime;
    });
    const week = weekdayRows(filteredOrders);
    const busiestDay = [...week].sort((a, b) => b.amount - a.amount || b.count - a.count)[0];
    const peakHour = mostCommonHour(filteredOrders);

    return {
      months,
      monthly,
      isMonthlyTotalBatch,
      filteredOrders,
      totals,
      restaurants,
      apps,
      statuses,
      recent,
      week,
      busiestDay,
      peakHour,
      topRestaurant: restaurants[0]
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
  const currentLabel = selectedMonth === "all" ? "All detected months" : monthLabel(selectedMonth);
  const rowLabel = dashboard.isMonthlyTotalBatch ? "monthly total" : "order";
  const rowLabelPlural = dashboard.isMonthlyTotalBatch ? "monthly totals" : "orders";
  const maxMonthly = Math.max(...dashboard.monthly.map((row) => row.amount), 1);
  const maxRestaurant = Math.max(...dashboard.restaurants.map((row) => row.amount), 1);
  const maxWeekday = Math.max(...dashboard.week.map((row) => row.amount), 1);

  return (
    <div className="screen dashboard-beautiful">
      {!hasOrders ? (
        <>
          <div className="dash-topbar">
            <div>
              <p className="eyebrow">OrderLedger</p>
              <h2 className="screen-title">Food spending</h2>
            </div>
            <button className="icon-btn" onClick={props.onOpenSettings} aria-label="Settings">
              <IconGear size={19} />
            </button>
          </div>
          <EmptyState
            icon={<IconInbox size={22} />}
            title="No dashboard yet"
            body="Upload screenshots in Import, then read them to build your spending summary."
          >
            <PrimaryButton onClick={props.onOpenImport}>Open Import</PrimaryButton>
          </EmptyState>
        </>
      ) : (
        <>
          <section className="dash-cover">
            <div className="dash-cover-top">
              <div>
                <span>OrderLedger</span>
                <strong>Food spending</strong>
              </div>
              <button className="dash-cover-gear" onClick={props.onOpenSettings} aria-label="Settings">
                <IconGear size={18} />
              </button>
            </div>

            <div className="dash-cover-main">
              <span className="dash-cover-label">{currentLabel}</span>
              <strong className="dash-cover-total tabular">{money(dashboard.totals.netSpend)}</strong>
              <span className="dash-cover-meta">
                {dashboard.totals.ordersTotal} {rowLabelPlural} / {dashboard.months.length} month{dashboard.months.length === 1 ? "" : "s"}
                {dashboard.isMonthlyTotalBatch ? "" : ` / ${dashboard.restaurants.length} restaurant${dashboard.restaurants.length === 1 ? "" : "s"}`}
              </span>
            </div>

            <div className="dash-cover-mini">
              <span>
                <small>Avg</small>
                <strong className="tabular">{money(dashboard.totals.averageOrder)}</strong>
              </span>
              <span className={dashboard.totals.needsCheck > 0 ? "warn" : ""}>
                <small>Needs check</small>
                <strong className="tabular">{dashboard.totals.needsCheck}</strong>
              </span>
            </div>
          </section>

          <div className="month-chip-row">
            <button className={selectedMonth === "all" ? "chip active" : "chip"} onClick={() => setSelectedMonth("all")}>All</button>
            {dashboard.months.map((month) => (
              <button key={month} className={selectedMonth === month ? "chip active" : "chip"} onClick={() => setSelectedMonth(month)}>
                {monthLabel(month)}
              </button>
            ))}
          </div>

          <div className="dash-stat-grid">
            <div className="dash-stat">
              <span className="dash-stat-label">Completed</span>
              <strong className="dash-stat-value tabular">{money(dashboard.totals.completedSpend)}</strong>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-label">Avg / order</span>
              <strong className="dash-stat-value tabular">{money(dashboard.totals.averageOrder)}</strong>
            </div>
            <div className="dash-stat">
              <span className="dash-stat-label">{dashboard.isMonthlyTotalBatch ? "Rows" : "Orders"}</span>
              <strong className="dash-stat-value tabular">{dashboard.totals.ordersTotal}</strong>
            </div>
            <div className={dashboard.totals.needsCheck > 0 ? "dash-stat warn" : "dash-stat"}>
              <span className="dash-stat-label">Needs check</span>
              <strong className="dash-stat-value tabular">{dashboard.totals.needsCheck}</strong>
            </div>
          </div>

          {dashboard.totals.needsCheck > 0 && (
            <Alert
              variant="warning"
              title={`${dashboard.totals.needsCheck} row${dashboard.totals.needsCheck === 1 ? "" : "s"} may need checking`}
              message="Open Import to check flagged orders against the original screenshots."
              onDismiss={undefined}
            />
          )}

          <section className="dashboard-section">
            <div className="dashboard-section-head">
              <h3>Monthly trend</h3>
              <span>{dashboard.months.length} found</span>
            </div>
            <div className="dash-trend">
              {dashboard.monthly.map((row) => {
                const height = Math.max(12, Math.round((row.amount / maxMonthly) * 92));
                return (
                  <button
                    className={selectedMonth === row.key ? "dash-trend-col selected" : "dash-trend-col"}
                    key={row.key}
                    onClick={() => setSelectedMonth(row.key)}
                  >
                    <span className="dash-trend-value tabular">{compactMoney(row.amount)}</span>
                    <span className="dash-trend-track"><i className="dash-trend-fill" style={{ height }} /></span>
                    <span className="dash-trend-month">{row.key === "unknown" ? "?" : row.key.slice(5)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {!dashboard.isMonthlyTotalBatch && (
            <>
              <section className="dashboard-section">
                <div className="dashboard-section-head">
                  <h3>By app</h3>
                  <span>{dashboard.apps.length} sources</span>
                </div>
                <div className="dash-stack" aria-hidden="true">
                  {dashboard.apps.map((row) => (
                    <i
                      className="dash-stack-seg"
                      key={row.key}
                      style={{
                        width: `${Math.max(5, (row.amount / Math.max(dashboard.totals.netSpend, 1)) * 100)}%`,
                        background: SOURCE_APP_COLOR[row.key] ?? SOURCE_APP_COLOR.unknown
                      }}
                    />
                  ))}
                </div>
                <div className="dash-app-list">
                  {dashboard.apps.map((row) => {
                    const pct = Math.round((row.amount / Math.max(dashboard.totals.netSpend, 1)) * 100);
                    return (
                      <div className="dash-app-row" key={row.key}>
                        <span className="dash-dot" style={{ background: SOURCE_APP_COLOR[row.key] ?? SOURCE_APP_COLOR.unknown }} />
                        <span className="dash-app-name">{row.label}</span>
                        <small>{row.count} order{row.count === 1 ? "" : "s"}</small>
                        <strong className="dash-app-amount tabular">{money(row.amount)}</strong>
                        <span className="dash-app-pct tabular">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="dashboard-section">
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
                          <span className="dash-rest-amount tabular">{money(row.amount)}</span>
                        </span>
                        <span className="dash-rest-track">
                          <i className="dash-rest-fill" style={{ width: `${Math.max(5, (row.amount / maxRestaurant) * 100)}%` }} />
                        </span>
                        <small>{row.count} order{row.count === 1 ? "" : "s"}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="dash-insight-row">
                <div className="dash-insight">
                  <span className="dash-insight-label">Favorite</span>
                  <strong>{dashboard.topRestaurant?.label ?? "Unknown"}</strong>
                  <small>{dashboard.topRestaurant ? money(dashboard.topRestaurant.amount) : "No restaurant data"}</small>
                </div>
                <div className="dash-insight">
                  <span className="dash-insight-label">Peak time</span>
                  <strong className="tabular">{dashboard.peakHour.label}</strong>
                  <small>{dashboard.peakHour.detail}</small>
                </div>
              </section>

              <section className="dashboard-section">
                <div className="dashboard-section-head">
                  <h3>Week pattern</h3>
                  <span>{dashboard.busiestDay?.label ?? "Unknown"} highest</span>
                </div>
                <div className="dash-week">
                  {dashboard.week.map((row) => (
                    <div className="dash-week-col" key={row.key}>
                      <span className="dash-week-track">
                        <i
                          className={row.amount === maxWeekday && row.amount > 0 ? "dash-week-fill max" : "dash-week-fill"}
                          style={{ height: `${row.amount > 0 ? Math.max(10, (row.amount / maxWeekday) * 56) : 4}px` }}
                        />
                      </span>
                      <small>{row.label}</small>
                    </div>
                  ))}
                </div>
              </section>

              <section className="dashboard-section">
                <div className="dashboard-section-head">
                  <h3>Status</h3>
                  <span>{money(dashboard.totals.refundedOrCancelled)} cancelled/refunded</span>
                </div>
                <div className="dash-status-grid">
                  {dashboard.statuses.map((row) => (
                    <div className="dash-status-row" key={row.key}>
                      <Badge status={row.key} />
                      <strong className="tabular">{row.count}</strong>
                      <span className="tabular">{money(row.amount)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          <section className="dashboard-section">
            <div className="dashboard-section-head">
              <h3>{dashboard.isMonthlyTotalBatch ? "Monthly totals" : "Recent orders"}</h3>
              <span>{dashboard.filteredOrders.length} {rowLabelPlural}</span>
            </div>
            <div className="dash-order-list">
              {dashboard.recent.slice(0, 12).map((order) => (
                <article className="dash-order" key={order.id}>
                  <i className="dash-order-app" style={{ background: SOURCE_APP_COLOR[order.source_app] ?? SOURCE_APP_COLOR.unknown }} />
                  <div className="dash-order-body">
                    <div className="dash-order-top">
                      <strong>{order.restaurant_name || "Unknown restaurant"}</strong>
                      <span className="dash-order-amount tabular">{money(orderAmount(order))}</span>
                    </div>
                    <div className="dash-order-item">{firstItem(order.items_text)}</div>
                    <div className="dash-order-meta">
                      <span>{SOURCE_APP_LABEL[order.source_app] ?? order.source_app ?? "Unknown"}</span>
                      <span>{fmtDateTime(order.ordered_at) || "Unknown time"}</span>
                      <Badge status={order.review_state !== "ok" ? order.review_state : order.status} />
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
