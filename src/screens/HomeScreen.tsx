import React, { useMemo, useState } from "react";
import {
  fmtDateTime,
  fmtMoney,
  fmtMonthLabel,
  parseFlags,
  flagLabel,
  SOURCE_APP_COLOR,
  SOURCE_APP_LABEL,
  type MonthBucket,
  type OrderRow
} from "../api";
import { Button, Empty, IconCamera, IconChart, IconExport, IconInbox, Tag } from "../components/ui";
import { useAppData } from "../state/AppData";

function monthKey(order: OrderRow) {
  return /^\d{4}-\d{2}/.test(order.ordered_at || "") ? order.ordered_at.slice(0, 7) : "unknown";
}

function monthTitle(month: string) {
  return month === "unknown" ? "ไม่ทราบเดือน" : fmtMonthLabel(month);
}

function appEntries(map: Record<string, number>) {
  return Object.entries(map)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
}

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function MiniCharts(props: { months: MonthBucket[]; orders: OrderRow[] }) {
  const bars = props.months
    .filter((m) => m.month !== "unknown")
    .slice(0, 8)
    .reverse();
  const maxBar = Math.max(1, ...bars.map((b) => b.netSpend));

  const weekday = new Array(7).fill(0) as number[];
  for (const order of props.orders) {
    if (order.review_tier === "blocked") continue;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(order.ordered_at) || /T00:00(:00)?$/.test(order.ordered_at)) continue;
    const day = new Date(order.ordered_at).getDay();
    if (day >= 0 && day < 7) weekday[day] += 1;
  }
  const maxDay = Math.max(1, ...weekday);
  const hasWeekday = weekday.some((n) => n > 0);

  if (bars.length < 2 && !hasWeekday) return null;

  return (
    <section className="card">
      <div className="card-head">
        <h3>แนวโน้ม</h3>
        <span>ยอดต่อเดือน</span>
      </div>
      {bars.length >= 2 && (
        <div className="mini-bars">
          {bars.map((bucket) => (
            <div className="mini-bar" key={bucket.month} title={`${fmtMonthLabel(bucket.month)} · ${fmtMoney(bucket.netSpend)}`}>
              <i style={{ height: `${Math.max(4, (bucket.netSpend / maxBar) * 100)}%` }} />
              <small>{bucket.month.slice(5)}</small>
            </div>
          ))}
        </div>
      )}
      {hasWeekday && (
        <>
          <div className="card-head" style={{ marginTop: ".6rem" }}>
            <h3 style={{ fontSize: "var(--tx-sub)" }}>วันที่สั่งบ่อย</h3>
            <span>ตามจำนวนออร์เดอร์</span>
          </div>
          <div className="mini-bars weekday">
            {weekday.map((count, day) => (
              <div className="mini-bar" key={day} title={`${WEEKDAYS[day]} · ${count}`}>
                <i style={{ height: `${Math.max(4, (count / maxDay) * 100)}%` }} />
                <small>{WEEKDAYS[day]}</small>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function MonthCard(props: { bucket: MonthBucket; orders: OrderRow[]; open: boolean; onToggle: () => void }) {
  const { bucket, orders, open, onToggle } = props;
  const apps = appEntries(bucket.byAppCount);
  const top = bucket.topRestaurants[0];
  return (
    <section className="card">
      <button className="month-card-head" onClick={onToggle} aria-expanded={open}>
        <span className="month-card-main">
          <strong>{monthTitle(bucket.month)}</strong>
          <small>
            {bucket.orderCount} ออร์เดอร์
            {bucket.reviewCount > 0 ? ` · ${bucket.reviewCount} ควรดู` : ""}
          </small>
          {apps.length > 0 && (
            <span className="month-card-apps">
              {apps.map(([app, count]) => (
                <span key={app}>
                  <i className="dot" style={{ background: SOURCE_APP_COLOR[app] ?? SOURCE_APP_COLOR.unknown }} />
                  {SOURCE_APP_LABEL[app] ?? app} {count}
                </span>
              ))}
            </span>
          )}
          {top && (
            <small className="month-card-top">
              บ่อยสุด: {top.name} ×{top.count}
            </small>
          )}
        </span>
        <span className="month-card-amt">
          <strong>{fmtMoney(bucket.netSpend)}</strong>
          <span>{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open && (
        <div className="order-list">
          {orders.map((order) => {
            const flags = parseFlags(order.flags_json);
            return (
              <article key={order.id} className={order.review_tier === "review" ? "order-row attn" : "order-row"}>
                <i
                  className="order-app-dot"
                  style={{ background: SOURCE_APP_COLOR[order.source_app] ?? SOURCE_APP_COLOR.unknown }}
                />
                <span className="order-main">
                  <span className="order-name-row">
                    <strong>{order.restaurant_name || "ไม่ทราบชื่อร้าน"}</strong>
                    {flags.length > 0 && <span className="mini-chip">{flagLabel(flags[0])}</span>}
                  </span>
                  <small>{fmtDateTime(order.ordered_at, order.date_precision) || "ไม่ระบุวันที่"}</small>
                </span>
                <span className="order-amt">{fmtMoney(order.net_amount || order.total_amount || 0)}</span>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function HomeScreen(props: { onCreateBatch: () => void; onOpenImport: () => void; onOpenExport: () => void }) {
  const { batches, allOrders, ledgerDashboard } = useAppData();
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  const ordersByMonth = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const order of allOrders) {
      if (order.review_tier === "blocked") continue;
      const key = monthKey(order);
      const list = map.get(key) ?? [];
      list.push(order);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => +new Date(b.ordered_at || 0) - +new Date(a.ordered_at || 0));
    }
    return map;
  }, [allOrders]);

  if (!batches.length) {
    return (
      <div className="screen">
        <Empty
          icon={<IconInbox size={22} />}
          title="Your ledger starts here"
          body="Create an import, add delivery screenshots, then let OrderLedger build the totals."
        >
          <Button onClick={props.onCreateBatch}>Create import</Button>
        </Empty>
      </div>
    );
  }

  const dash = ledgerDashboard;
  const apps = dash ? appEntries(dash.byAppSpend) : [];
  const total = dash?.confirmedNet ?? 0;

  return (
    <main className="screen">
      <div className="screen-head">
        <p className="overline">Spending overview</p>
        <h2>Food ledger</h2>
      </div>

      <section className="dash-hero">
        <div className="dash-hero-top">
          <p className="overline">All confirmed orders</p>
          <Tag tone="inkfill">THB</Tag>
        </div>
        <div className="dash-hero-num">
          <strong>{fmtMoney(total)}</strong>
          <span>฿</span>
        </div>
        <span className="dash-delta">
          {dash?.orderCount ?? 0} ออร์เดอร์ · {dash?.restaurantCount ?? 0} ร้าน · {dash?.monthCount ?? 0} เดือน
        </span>
        <div className="dash-hero-tiles">
          <div className="dash-hero-tile">
            <p className="overline">ยกเลิก / คืนเงิน</p>
            <strong>{fmtMoney(dash?.refundedOrCancelled ?? 0)} ฿</strong>
          </div>
          <div className="dash-hero-tile">
            <p className="overline">เฉลี่ยต่อออร์เดอร์</p>
            <strong>{fmtMoney(dash && dash.orderCount ? dash.confirmedNet / dash.orderCount : 0)} ฿</strong>
          </div>
        </div>
      </section>

      {!!dash?.blockedCount && (
        <button className="notice warn" onClick={props.onOpenImport}>
          <IconChart size={16} />
          <span className="notice-body">
            <strong>{dash.blockedCount} รายการอ่านไม่ชัด</strong>
            <p>ยังไม่รวมในยอด — เปิด Import เพื่อตรวจกับสกรีนช็อต</p>
          </span>
        </button>
      )}

      {apps.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>Spend by delivery app</h3>
            <span>{apps.length} apps</span>
          </div>
          <div className="split-bar">
            {apps.map(([app, value]) => (
              <i
                key={app}
                style={{
                  width: `${Math.max(5, (value / Math.max(total, 1)) * 100)}%`,
                  background: SOURCE_APP_COLOR[app] ?? SOURCE_APP_COLOR.unknown
                }}
              />
            ))}
          </div>
          <div className="split-legend">
            {apps.map(([app, value]) => (
              <div className="split-row" key={app}>
                <i className="dot" style={{ background: SOURCE_APP_COLOR[app] ?? SOURCE_APP_COLOR.unknown }} />
                <span>{SOURCE_APP_LABEL[app] ?? app}</span>
                <em>{fmtMoney(value)}</em>
              </div>
            ))}
          </div>
        </section>
      )}

      {dash && <MiniCharts months={dash.months} orders={allOrders} />}

      {(dash?.months ?? []).map((bucket) => (
        <MonthCard
          key={bucket.month}
          bucket={bucket}
          orders={ordersByMonth.get(bucket.month) ?? []}
          open={!!openMonths[bucket.month]}
          onToggle={() => setOpenMonths((prev) => ({ ...prev, [bucket.month]: !prev[bucket.month] }))}
        />
      ))}

      <div className="btn-row">
        <Button tone="line" wide onClick={props.onOpenImport}>
          <IconCamera size={16} /> Import
        </Button>
        <Button wide onClick={props.onOpenExport}>
          <IconExport size={16} /> Export
        </Button>
      </div>
    </main>
  );
}
