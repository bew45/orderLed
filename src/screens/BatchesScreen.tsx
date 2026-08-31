import React, { useState } from "react";
import { fmtMoney } from "../api";
import { Button, Empty, IconHistory, IconPlus, IconTrash, StateTag } from "../components/ui";
import { useAppData } from "../state/AppData";

export function BatchesScreen(props: { onCreateBatch: () => void; onSelected: () => void }) {
  const { batches, activeBatchId, selectBatch, deleteBatch } = useAppData();
  const [confirm, setConfirm] = useState("");
  const remove = async (id: string) => { if (confirm !== id) { setConfirm(id); return; } await deleteBatch(id); setConfirm(""); };
  return <main className="screen"><div className="screen-head"><p className="overline">Past imports</p><h2>History</h2><p>Each import keeps its screenshots, results, and exports together.</p></div><Button tone="line" wide onClick={props.onCreateBatch}><IconPlus size={16} /> New import</Button>{batches.length === 0 ? <Empty icon={<IconHistory size={22} />} title="No imports yet" body="Create an import to start building your order ledger." /> : <div className="stack">{batches.map((batch) => <article className={batch.id === activeBatchId ? "hist-card on" : "hist-card"} key={batch.id}><div className="hist-id-row"><div><strong>{batch.title}</strong>{batch.id === activeBatchId && <StateTag state="ok" label="Current" />}</div>{batch.summary.ordersNeedingReview > 0 && <StateTag state="needs_check" label={`${batch.summary.ordersNeedingReview} check`} />}</div><div className="hist-meta"><span>{batch.summary.screenshotsTotal} images</span><span>·</span><span>{batch.summary.ordersTotal} orders</span><span>·</span><b>{fmtMoney(batch.summary.netSpend)} ฿</b></div><div className="hist-actions"><Button slim tone={batch.id === activeBatchId ? "ink" : "line"} onClick={() => { selectBatch(batch.id); props.onSelected(); }}>{batch.id === activeBatchId ? "Open import" : "Select"}</Button><Button slim tone={confirm === batch.id ? "bad" : "line"} onClick={() => void remove(batch.id)}><IconTrash size={13} /> {confirm === batch.id ? "Confirm delete" : "Delete"}</Button></div></article>)}</div>}</main>;
}
