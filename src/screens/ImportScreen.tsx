import React, { useEffect, useMemo, useState } from "react";
import { endpoints, fmtMoney, fmtMonthLabel, type BatchRollup, type OrderRow, type ScreenshotRow } from "../api";
import { CheckFlow } from "../components/CheckFlow";
import { ScreenshotList } from "../components/ScreenshotList";
import { Button, Empty, IconCamera, IconChart, IconInbox, Notice, Tag } from "../components/ui";
import { useAppData } from "../state/AppData";

function isFinished(shot: ScreenshotRow) { return shot.processed_at > 0 && ["done", "failed", "skipped"].includes(shot.ocr_status) && shot.llm_status === "done"; }
function amount(order: OrderRow) { return Number(order.net_amount || order.total_amount || 0); }
function screenshotIds(order: OrderRow) { try { const ids = JSON.parse(order.source_screenshot_ids_json || "[]"); return Array.isArray(ids) ? ids.map(String) : []; } catch { return []; } }

export function ImportScreen(props: { onUpload: () => void; onCreateBatch: () => void; onOpenDashboard: () => void }) {
  const { activeBatch, summary, screenshots, orders, deleteScreenshot, processActiveBatch, processScreenshot, stopProcessing, refreshOrders } = useAppData();
  const [processing, setProcessing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState("");
  const [checkTarget, setCheckTarget] = useState<{ screenshotId?: string } | null>(null);
  const [rollup, setRollup] = useState<BatchRollup | null>(null);

  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => void refreshOrders(), 1500);
    return () => window.clearInterval(timer);
  }, [processing, refreshOrders]);

  useEffect(() => {
    if (!activeBatch) { setRollup(null); return; }
    let cancelled = false;
    endpoints
      .batchRollup(activeBatch.id)
      .then((data) => { if (!cancelled) setRollup(data.rollup); })
      .catch(() => { if (!cancelled) setRollup(null); });
    return () => { cancelled = true; };
  }, [activeBatch?.id, summary?.ordersTotal, summary?.ordersBlocked, processing]);

  const completedShots = screenshots.filter(isFinished);
  const finalizedOrders = useMemo(() => {
    const ids = new Set(completedShots.map((shot) => shot.id));
    return orders.filter((order) => screenshotIds(order).some((id) => ids.has(id)));
  }, [orders, completedShots]);
  const unread = screenshots.filter((shot) => !shot.processed_at && !shot.error).length;
  const needsCheck = finalizedOrders.filter((order) => order.review_tier !== "clean").length;
  const blocked = finalizedOrders.filter((order) => order.review_tier === "blocked").length;
  const readCount = completedShots.length;
  const total = summary?.screenshotsTotal ?? screenshots.length;
  const failed = summary?.screenshotsFailed ?? screenshots.filter((shot) => shot.error).length;
  const percent = total ? Math.round((readCount / total) * 100) : 0;

  const run = async (force: boolean) => {
    setProcessing(true); setMessage("");
    try { await processActiveBatch(force); } catch (error: any) { setMessage(error.message || "Could not read screenshots"); }
    finally { setProcessing(false); setStopping(false); }
  };
  const stop = async () => { setStopping(true); try { const stopped = await stopProcessing(); setMessage(stopped ? "Stopping the current read…" : "No read is running."); } catch (error: any) { setMessage(error.message || "Could not stop reading"); } finally { setStopping(false); } };

  if (!activeBatch) return <main className="screen"><Empty icon={<IconInbox size={22} />} title="Create your first import" body="An import keeps a group of screenshots together while you read and export them."><Button onClick={props.onCreateBatch}>New import</Button></Empty></main>;

  const totalSpend = finalizedOrders.reduce((sum, order) => sum + amount(order), 0);
  const periodLabel = (rollup?.periods ?? [])
    .map((p) => (p === "unknown" ? "ไม่ทราบเดือน" : fmtMonthLabel(p)))
    .join(" · ");

  return (
    <main className="screen">
      <div className="imp-batch-row"><span className="imp-batch-pill"><i className="dot ok" /><strong>{activeBatch.title}</strong></span><Button tone="line" slim onClick={props.onCreateBatch}>New</Button></div>
      <div className="screen-head"><p className="overline">Import workspace</p><h2>Read your screenshots</h2><p>Upload first. Read runs vision extraction and the OCR amount check.</p></div>

      <button className="imp-drop" onClick={props.onUpload}><span className="imp-drop-orb"><IconCamera size={20} /></span><strong>Upload screenshots</strong><small>{screenshots.length ? `${screenshots.length} images already in this import` : "Choose as many iPhone screenshots as you need"}</small></button>

      {screenshots.length > 0 && <section className="card"><div className="card-head"><h3>Read progress</h3><Tag tone={processing ? "inkfill" : failed ? "warn" : readCount ? "ok" : "plain"}>{processing ? "Reading" : failed ? "Attention" : readCount ? "Ready" : "Waiting"}</Tag></div><div className="imp-progress"><span className="imp-progress-track"><i style={{ width: `${percent}%` }} /></span><em>{readCount}/{total}</em></div><p className="imp-read-note">OCR and vision extraction are saved screenshot by screenshot.</p></section>}

      {screenshots.length > 0 && <div className="btn-row"><Button wide disabled={processing || (!unread && !failed)} onClick={() => run(false)}>{processing ? "Reading…" : unread ? `Read ${unread} new` : "Retry failed"}</Button><Button tone="line" wide disabled={processing || !readCount} onClick={() => run(true)}>Re-read all</Button></div>}
      {processing && <Button tone="bad" wide disabled={stopping} onClick={stop}>{stopping ? "Stopping…" : "Stop reading"}</Button>}
      {message && <Notice tone={message.startsWith("Stopping") || message.startsWith("No read") ? "plain" : "bad"} title="Read status" body={message} onDismiss={() => setMessage("")} />}

      {rollup && (rollup.newOrders + rollup.mergedOrders) > 0 && <section className="card"><div className="card-head"><h3>โพสต์เข้าบัญชีแล้ว</h3><span>{periodLabel || "—"}</span></div><div className="imp-summary"><div className="imp-summary-row"><span>รายการใหม่</span><strong>{rollup.newOrders}{rollup.mergedOrders > 0 ? ` · รวมกับของเดิม ${rollup.mergedOrders}` : ""}</strong></div><div className="imp-summary-row"><span>ยอดที่เพิ่ม (ไม่รวม blocked)</span><strong className="tabular">{fmtMoney(rollup.netPosted)} ฿</strong></div>{(rollup.reviewCount > 0 || rollup.blockedCount > 0) && <div className="imp-summary-row"><span>ต้องดู</span><strong>{rollup.reviewCount > 0 ? `${rollup.reviewCount} ควรดู` : ""}{rollup.reviewCount > 0 && rollup.blockedCount > 0 ? " · " : ""}{rollup.blockedCount > 0 ? `${rollup.blockedCount} อ่านไม่ชัด` : ""}</strong></div>}</div></section>}
      {finalizedOrders.length > 0 && <Button wide onClick={props.onOpenDashboard}><IconChart size={16} /> View summary</Button>}
      {needsCheck > 0 && <Button tone="line" wide onClick={() => setCheckTarget({})}>ตรวจ {needsCheck} รายการ{blocked > 0 ? ` (${blocked} อ่านไม่ชัด)` : ""}</Button>}

      {screenshots.length === 0 ? <Empty icon={<IconCamera size={22} />} title="No screenshots yet" body="Upload screenshots to this import. You can remove any mistakes before reading." /> : <section><div className="card-head"><h3>Screenshot evidence</h3><span>{screenshots.length} files</span></div><ScreenshotList screenshots={screenshots} orders={finalizedOrders} onDelete={deleteScreenshot} onCheck={(screenshotId) => setCheckTarget({ screenshotId })} onRerun={processScreenshot} showOcr /></section>}
      {checkTarget && <CheckFlow orders={orders} screenshots={screenshots} focusScreenshotId={checkTarget.screenshotId} onClose={() => setCheckTarget(null)} processScreenshot={processScreenshot} />}
    </main>
  );
}
