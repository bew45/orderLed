import React, { useMemo, useState } from "react";
import { endpoints, fmtMoney, parseAmountCheck, SOURCE_APP_LABEL, type OrderRow, type ScreenshotRow } from "../api";
import { IconEdit, IconRefresh, IconTrash, StateTag, Tag } from "./ui";

function finished(shot: ScreenshotRow) { return shot.processed_at > 0 && ["done", "failed", "skipped"].includes(shot.ocr_status) && shot.llm_status === "done"; }
function orderIds(order: OrderRow) { try { const ids = JSON.parse(order.source_screenshot_ids_json || "[]"); return Array.isArray(ids) ? ids.map(String) : []; } catch { return []; } }
function ocrText(value: string) { try { const rows = JSON.parse(value || "[]"); return Array.isArray(rows) ? rows.map((row) => String(row?.text || "")).filter(Boolean) : []; } catch { return []; } }

export function ScreenshotList(props: { screenshots: ScreenshotRow[]; orders?: OrderRow[]; onDelete?: (id: string) => Promise<void>; onCheck?: (id: string) => void; onRerun?: (id: string) => Promise<any>; limit?: number; showOcr?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState("");
  const shots = props.limit ? props.screenshots.slice(0, props.limit) : props.screenshots;
  const byShot = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    (props.orders ?? []).forEach((order) => orderIds(order).forEach((id) => map.set(id, [...(map.get(id) ?? []), order])));
    return map;
  }, [props.orders]);
  const remove = async (id: string) => {
    if (!props.onDelete) return;
    if (confirm !== id) { setConfirm(id); return; }
    setBusy(id); try { await props.onDelete(id); } finally { setBusy(""); setConfirm(""); }
  };
  return <div className="shot-list">{shots.map((shot) => {
    const orders = byShot.get(shot.id) ?? [];
    const check = parseAmountCheck(shot.amount_check_json);
    const done = finished(shot);
    const issue = Boolean(shot.error || shot.llm_error || orders.some((order) => order.review_state === "needs_check") || (done && ["mismatch", "unavailable"].includes(shot.amount_check_state)));
    const expanded = open[shot.id] ?? issue;
    const lines = ocrText(shot.ocr_text_json);
    return <article className={shot.error || shot.llm_error ? "shot-row broken" : issue ? "shot-row attn" : "shot-row"} key={shot.id}>
      <div className="shot-row-top"><a className="shot-thumb" href={endpoints.screenshotImageUrl(shot.id)} target="_blank" rel="noreferrer"><img src={endpoints.screenshotImageUrl(shot.id)} alt={shot.original_name} loading="lazy" /></a><div className="shot-main"><div className="shot-name-row"><strong>{shot.original_name}</strong><StateTag state={shot.error || shot.llm_error ? "refunded" : done ? "completed" : shot.ocr_status === "running" || shot.llm_status === "running" ? "unknown" : "not_checked"} label={shot.error || shot.llm_error ? "Failed" : done ? "Read" : shot.ocr_status === "running" || shot.llm_status === "running" ? "Reading" : "Uploaded"} /></div><div className="shot-tag-row"><Tag>{SOURCE_APP_LABEL[shot.source_app_guess] ?? "Unknown"}</Tag>{done && <Tag tone={check?.state === "matched" ? "ok" : check?.state === "mismatch" || check?.state === "unavailable" ? "warn" : "plain"}>{check?.state === "matched" ? "Amounts matched" : check?.state === "mismatch" ? "Needs check" : check?.state === "unavailable" ? "Not verified" : `${orders.length} orders`}</Tag>}<Tag>{done ? `${orders.length} orders` : `${shot.width || 0} × ${shot.height || 0}`}</Tag></div>{(shot.error || shot.llm_error) && <span className="shot-error">{shot.error || shot.llm_error}</span>}</div><div className="shot-actions">{props.onCheck && done && orders.length > 0 && <button className="shot-act" onClick={() => props.onCheck?.(shot.id)} aria-label="Check orders"><IconEdit size={15} /></button>}{props.onRerun && <button className="shot-act" disabled={busy === shot.id} onClick={async () => { setBusy(shot.id); try { await props.onRerun?.(shot.id); } finally { setBusy(""); } }} aria-label="Read again"><IconRefresh size={15} className={busy === shot.id ? "spin" : ""} /></button>}{props.onDelete && <button className={confirm === shot.id ? "shot-act danger-armed" : "shot-act"} disabled={busy === shot.id} onClick={() => void remove(shot.id)} aria-label={confirm === shot.id ? "Confirm delete" : "Delete screenshot"}><IconTrash size={15} /></button>}</div></div>
      {props.showOcr && (lines.length > 0 || check || orders.length > 0) && <div className="shot-detail"><button className="text-btn" onClick={() => setOpen((current) => ({ ...current, [shot.id]: !expanded }))}>{expanded ? "Hide details" : "Show OCR & amount check"}</button>{expanded && <><div className="shot-check-grid">{check && <><AmountColumn title="AI amounts" values={check.aiAmounts} missing={check.missingFromAi} /><AmountColumn title="OCR amounts" values={check.scannerAmounts} missing={check.missingFromScanner} /></>}{!check && <span className="shot-check-note">Amount check has not run yet.</span>}</div>{check?.reasons.length ? <span className="shot-check-note">{check.reasons.join(" · ")}</span> : null}{orders.length > 0 && <div className="shot-orders">{orders.map((order) => <div className="shot-order-row" key={order.id}><strong>{order.restaurant_name || "Unknown restaurant"}</strong><StateTag state={order.review_state} /><span className="tabular">{fmtMoney(order.net_amount || order.total_amount)} ฿</span></div>)}</div>}{lines.length > 0 && <pre className="shot-ocr-lines">{lines.slice(0, 12).join("\n")}</pre>}</>}</div>}
    </article>;
  })}</div>;
}

function AmountColumn(props: { title: string; values: number[]; missing: number[] }) { return <div className="shot-check-col"><h4>{props.title}</h4><ul>{props.values.length ? props.values.map((value, index) => <li className={props.missing.includes(value) ? "miss" : ""} key={`${value}-${index}`}>{fmtMoney(value)} ฿</li>) : <li>None</li>}</ul></div>; }
