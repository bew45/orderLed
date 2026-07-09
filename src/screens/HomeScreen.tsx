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
import { IconCamera, IconExport, IconGear, IconInbox, PrimaryButton } from "../components/ui";

type AggregateRow = {
  key: string;
  label: string;
  count: number;
  amount: number;
};

const WEEK_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function money(value: number) {
  return `${fmtMoney(value)}฿`;
}

function orderAmount(order: Pick<OrderRow, "net_amount" | "total_amount">) {
  return Number(order.net_amount || order.total_amount || 0);
}

function orderMonth(order: Pick<OrderRow, "ordered_at">) {
  return /^\d{4}-\d{2}/.test(order.ordered_at || "") ? order.ordered_at.slice(0, 7) : "unknown";
}

function monthLabel(month: string) {
  return month === "unknown" ? "Unknown" : fmtMonthLabel(month);
}

function shortMonthLabel(month: string) {
  if (month === "unknown") return "Unknown";
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

function compactMoney(value: number) {
  if (Math.abs(value) >= 1000) return `${fmtMoney(value / 1000)}k`;
  return fmtMoney(value);
}

function firstItem(itemsText: string) {
  const first = itemsText
    .split(/\r?\n|,\s*/)
    .map((item) => item.trim())
    .filter(Boolean)[0];
  return first || "No item text";
}

function isMonthlyTotalSnapshot(order: OrderRow) {
  return order.duplicate_key.startsWith("legacy-monthly-total:");
}

function validOrderDate(order: OrderRow) {
  const date = new Date(order.ordered_at || "");
  return Number.isNaN(date.getTime()) ? null : date;
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
  return { label: `${String(best[0]).padStart(2, "0")}:00`, detail: `${best[1]} order${best[1] === 1 ? "" : "s"}` };
}

function weekdayRows(orders: OrderRow[]) {
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

function statusDot(status: string) {
  if (status === "completed") return "#16A34A";
  if (status === "refunded") return "#F59E0B";
  if (status === "cancelled") return "#9CA3AF";
  return "#D1D5DB";
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
    const filteredOrders = selectedMonth === "all"
      ? allOrders
      : allOrders.filter((order) => orderMonth(order) === selectedMonth);
    const netSpend = filteredOrders.reduce((sum, order) => sum + orderAmount(order), 0);
    const completedSpend = filteredOrders
      .filter((order) => order.status === "completed")
      .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const needsCheck = filteredOrders.filter((order) => order.review_state === "needs_check").length;
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
      apps,
      averageOrder: filteredOrders.length ? netSpend / filteredOrders.length : 0,
      busiestDay,
      completedSpend,
      filteredOrders,
      isMonthlyTotalBatch,
      monthly,
      needsCheck,
      netSpend,
      peakHour,
      recent,
      restaurants,
      statuses,
      week
    };
  }, [allOrders, selectedMonth]);

  if (batches.length === 0) {
    return (
      <div className="ol-dashboard ol-dashboard-empty">
        <div className="ol-top">
          <div>
            <span>OrderLedger</span>
            <h2>Food spending</h2>
          </div>
          <button onClick={props.onOpenSettings} aria-label="Settings"><IconGear size={18} /></button>
        </div>
        <div className="ol-empty">
          <span><IconInbox size={24} /></span>
          <h3>Start an import</h3>
          <p>Create an import, then upload delivery screenshots from Grab, LINE MAN, or ShopeeFood.</p>
          <PrimaryButton onClick={props.onCreateBatch}>Create import</PrimaryButton>
        </div>
      </div>
    );
  }

  const months = dashboard.monthly.map((row) => row.key);
  const hasOrders = allOrders.length > 0;
  const maxMonthly = Math.max(...dashboard.monthly.map((row) => row.amount), 1);
  const maxRestaurant = Math.max(...dashboard.restaurants.map((row) => row.amount), 1);
  const maxWeekday = Math.max(...dashboard.week.map((row) => row.amount), 1);
  const currentLabel = selectedMonth === "all" ? "All months" : monthLabel(selectedMonth);
  const topRestaurant = dashboard.restaurants[0];

  return (
    <div className="ol-dashboard">
      <div className="ol-top">
        <div>
          <span>OrderLedger</span>
          <h2>Food spending</h2>
        </div>
        <div className="ol-top-actions">
          <button onClick={props.onOpenImport} aria-label="Import"><IconCamera size={18} /></button>
          <button onClick={props.onOpenSettings} aria-label="Settings"><IconGear size={18} /></button>
        </div>
      </div>

      {!hasOrders ? (
        <div className="ol-empty">
          <span><IconInbox size={24} /></span>
          <h3>No dashboard yet</h3>
          <p>Upload screenshots in Import, then read them to build your spending summary.</p>
          <PrimaryButton onClick={props.onOpenImport}>Open Import</PrimaryButton>
        </div>
      ) : (
        <>
          <section className="ol-hero">
            <div className="ol-hero-top">
              <span>{currentLabel}</span>
              <button onClick={props.onOpenImport}>Import</button>
            </div>
            <strong className="ol-hero-total tabular">{money(dashboard.netSpend)}</strong>
            <div className="ol-hero-meta">
              <span>{dashboard.filteredOrders.length} orders</span>
              <span>{months.length} months</span>
              <span>{dashboard.restaurants.length} restaurants</span>
            </div>
            <div className="ol-hero-grid">
              <span>
                <small>Completed</small>
                <strong className="tabular">{money(dashboard.completedSpend)}</strong>
              </span>
              <span>
                <small>Avg/order</small>
                <strong className="tabular">{money(dashboard.averageOrder)}</strong>
              </span>
            </div>
          </section>

          <div className="ol-months">
            <button className={selectedMonth === "all" ? "active" : ""} onClick={() => setSelectedMonth("all")}>All</button>
            {months.map((month) => (
              <button key={month} className={selectedMonth === month ? "active" : ""} onClick={() => setSelectedMonth(month)}>
                {monthLabel(month)}
              </button>
            ))}
          </div>

          {dashboard.needsCheck > 0 && (
            <button className="ol-check-card" onClick={props.onOpenImport}>
              <span>{dashboard.needsCheck}</span>
              <div>
                <strong>orders need check</strong>
                <small>Open Import to compare flagged rows with screenshots</small>
              </div>
            </button>
          )}

          <section className="ol-card ol-card-dark">
            <div className="ol-card-head">
              <h3>Monthly trend</h3>
              <span>{months.length} found</span>
            </div>
            <div className="ol-month-bars">
              {dashboard.monthly.map((row) => (
                <button key={row.key} onClick={() => setSelectedMonth(row.key)} className={selectedMonth === row.key ? "active" : ""}>
                  <span className="tabular">{compactMoney(row.amount)}</span>
                  <i><b style={{ height: `${Math.max(8, (row.amount / maxMonthly) * 100)}%` }} /></i>
                  <small>{shortMonthLabel(row.key)}</small>
                </button>
              ))}
            </div>
          </section>

          {!dashboard.isMonthlyTotalBatch && (
            <>
              <section className="ol-card">
                <div className="ol-card-head">
                  <h3>Ledger health</h3>
                  <span>{dashboard.needsCheck ? `${dashboard.needsCheck} flagged` : "All clear"}</span>
                </div>
                <div className="ol-health-row">
                  {dashboard.statuses.map((row) => (
                    <span key={row.key}>
                      <i style={{ background: statusDot(row.key) }} />
                      {row.label} {row.count}
                    </span>
                  ))}
                </div>
                <div className="ol-app-stack">
                  {dashboard.apps.map((row) => (
                    <i
                      key={row.key}
                      style={{
                        width: `${Math.max(5, (row.amount / Math.max(dashboard.netSpend, 1)) * 100)}%`,
                        background: SOURCE_APP_COLOR[row.key] ?? SOURCE_APP_COLOR.unknown
                      }}
                    />
                  ))}
                </div>
                <div className="ol-app-list">
                  {dashboard.apps.map((row) => (
                    <div key={row.key}>
                      <span><i style={{ background: SOURCE_APP_COLOR[row.key] ?? SOURCE_APP_COLOR.unknown }} />{row.label}</span>
                      <strong className="tabular">{money(row.amount)}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="ol-card">
                <div className="ol-card-head">
                  <h3>Top restaurants</h3>
                  <span>{dashboard.restaurants.length} found</span>
                </div>
                <div className="ol-rank-list">
                  {dashboard.restaurants.slice(0, 6).map((row, index) => (
                    <div key={row.key}>
                      <span className="ol-rank">{index + 1}</span>
                      <span className="ol-rank-main">
                        <strong>{row.label}</strong>
                        <small>{row.count} orders</small>
                        <i><b style={{ width: `${Math.max(6, (row.amount / maxRestaurant) * 100)}%` }} /></i>
                      </span>
                      <span className="ol-rank-money tabular">{money(row.amount)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="ol-insight">
                <div>
                  <span>Favorite</span>
                  <strong>{topRestaurant?.label ?? "Unknown"}</strong>
                  <small>{topRestaurant ? money(topRestaurant.amount) : "No restaurant data"}</small>
                </div>
                <div>
                  <span>Peak time</span>
                  <strong className="tabular">{dashboard.peakHour.label}</strong>
                  <small>{dashboard.peakHour.detail}</small>
                </div>
              </section>

              <section className="ol-card">
                <div className="ol-card-head">
                  <h3>Week pattern</h3>
                  <span>{dashboard.busiestDay?.label ?? "Unknown"} highest</span>
                </div>
                <div className="ol-week">
                  {dashboard.week.map((row) => (
                    <span key={row.key}>
                      <i><b style={{ height: `${row.amount > 0 ? Math.max(7, (row.amount / maxWeekday) * 100) : 5}%` }} /></i>
                      <small>{row.label}</small>
                    </span>
                  ))}
                </div>
              </section>
            </>
          )}

          <section className="ol-card">
            <div className="ol-card-head">
              <h3>Recent</h3>
              <span>{dashboard.recent.length} orders</span>
            </div>
            <div className="ol-recent">
              {dashboard.recent.slice(0, 12).map((order) => {
                const appColor = SOURCE_APP_COLOR[order.source_app] ?? SOURCE_APP_COLOR.unknown;
                const flagged = order.review_state === "needs_check";
                return (
                  <article key={order.id} className={flagged ? "flagged" : ""}>
                    <i style={{ background: appColor }} />
                    <div>
                      <strong>{order.restaurant_name || "Unknown restaurant"}</strong>
                      <small>{firstItem(order.items_text)} · {fmtDateTime(order.ordered_at) || "Unknown time"}</small>
                    </div>
                    <span className="tabular">{money(orderAmount(order))}</span>
                    <b style={{ background: statusDot(order.status) }} title={STATUS_LABEL[order.status] ?? order.status} />
                  </article>
                );
              })}
            </div>
          </section>

          <button className="ol-export-shortcut">
            <IconExport size={16} />
            Export selected ledger
          </button>
        </>
      )}
    </div>
  );
}
