import React, { useMemo, useState } from "react";
import { endpoints, fmtMoney, fmtMonthLabel, type OrderRow, type PdfStyle } from "../api";
import { Button, Empty, IconArrowUpRight, IconExport, Notice, Tag } from "../components/ui";
import { useAppData } from "../state/AppData";

const styles: Array<{ id: PdfStyle; name: string; copy: string }> = [
  { id: "midnight", name: "Midnight", copy: "Full statement with apps and restaurant summary" },
  { id: "minimal", name: "Minimal", copy: "Clean order list with item details hidden" },
  { id: "audit", name: "Audit", copy: "Full detail plus verification state per order" }
];
const monthOf = (order: OrderRow) => /^\d{4}-\d{2}/.test(order.ordered_at || "") ? order.ordered_at.slice(0, 7) : "unknown";
const amount = (order: OrderRow) => Number(order.net_amount || order.total_amount || 0);
const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

async function fetchPdf(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not create PDF (${response.status})`);
  return response.blob();
}

function download(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function ExportScreen() {
  const { activeBatch, orders, allOrders, ledgerDashboard, settings } = useAppData();
  const [scope, setScope] = useState<"ledger" | "batch">("ledger");
  const [month, setMonth] = useState("all");
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>(settings?.pdf_style ?? "midnight");
  const [pdfBusy, setPdfBusy] = useState<"share" | "save" | "">("");
  const [pdfError, setPdfError] = useState("");
  const sourceOrders = scope === "ledger" ? allOrders : orders;
  const months = useMemo(() => {
    if (scope === "ledger" && ledgerDashboard) return ledgerDashboard.months.map((m) => m.month);
    return [...new Set(sourceOrders.map(monthOf))].sort().reverse();
  }, [scope, ledgerDashboard, sourceOrders]);
  const selected = month === "all" ? sourceOrders : sourceOrders.filter((order) => monthOf(order) === month);
  const total = selected.filter((o) => o.review_tier !== "blocked").reduce((sum, order) => sum + amount(order), 0);
  const checks = selected.filter((order) => order.review_tier === "blocked").length;
  if (scope === "batch" && !activeBatch) return <main className="screen"><Empty icon={<IconExport size={22} />} title="Nothing to export" body="Create an import and read screenshots before exporting a ledger." /></main>;
  const url = (kind: "xls" | "csv" | "pdf") =>
    scope === "ledger"
      ? endpoints.ledgerExportUrl(kind, month, kind === "pdf" ? pdfStyle : undefined)
      : endpoints.exportUrl(activeBatch!.id, kind, month === "all" ? undefined : month, kind === "pdf" ? pdfStyle : undefined);
  const filename = `orderledger-${scope === "ledger" ? "ledger" : "import"}-${month === "all" ? "all" : month}-${pdfStyle}.pdf`;
  const withPdf = async (action: "share" | "save") => {
    setPdfBusy(action); setPdfError("");
    try {
      const blob = await fetchPdf(url("pdf"));
      if (action === "share") {
        const file = new File([blob], filename, { type: "application/pdf" });
        if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: "OrderLedger statement", files: [file] });
        } else {
          download(blob, filename);
        }
      } else {
        download(blob, filename);
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") setPdfError(error?.message || "Could not prepare PDF");
    } finally { setPdfBusy(""); }
  };
  return <main className="screen"><div className="screen-head"><p className="overline">Export ledger</p><h2>Ready when you are</h2><p>{scope === "ledger" ? "Whole ledger — grouped by month" : activeBatch?.title ?? "This import"}</p></div><div className="chip-row"><button className={scope === "ledger" ? "chip on" : "chip"} onClick={() => { setScope("ledger"); setMonth("all"); }}>ทั้ง ledger</button><button className={scope === "batch" ? "chip on" : "chip"} disabled={!activeBatch} onClick={() => { setScope("batch"); setMonth("all"); }}>batch นี้</button></div><section className="dash-hero"><div className="dash-hero-top"><p className="overline">{month === "all" ? (scope === "ledger" ? "All periods" : "Full import") : fmtMonthLabel(month)}</p><Tag tone="inkfill">{selected.length} orders</Tag></div><div className="dash-hero-num"><strong>{fmtMoney(total)}</strong><span>฿</span></div><span className="dash-delta">Confirmed net (blocked rows excluded)</span></section><div className="chip-row"><button className={month === "all" ? "chip on" : "chip"} onClick={() => setMonth("all")}>All</button>{months.map((value) => <button className={month === value ? "chip on" : "chip"} onClick={() => setMonth(value)} key={value}>{value === "unknown" ? "Unknown" : fmtMonthLabel(value)}</button>)}</div>{checks > 0 && <Notice tone="warn" title={`${checks} รายการยังไม่ยืนยัน`} body="ไม่รวมในยอด export — ตรวจใน Import ก่อนได้ หรือดูใน audit PDF" />}<section className="card"><div className="card-head"><h3>PDF statement style</h3><span>Pick for this export</span></div><div className="pdf-export-options">{styles.map((style) => <button key={style.id} className={pdfStyle === style.id ? "pdf-export-option on" : "pdf-export-option"} onClick={() => setPdfStyle(style.id)}><strong>{style.name}</strong><small>{style.copy}</small></button>)}</div></section><section className="card"><div className="card-head"><h3>Export files</h3><span>Selected range</span></div><div className="exp-format"><span className="exp-format-orb">PDF</span><span className="exp-format-main"><strong>{styles.find((style) => style.id === pdfStyle)?.name} PDF <span>.pdf</span></strong><small>Share or save directly without opening a PDF tab</small></span></div><div className="btn-row"><Button wide disabled={Boolean(pdfBusy)} onClick={() => void withPdf("share")}>{pdfBusy === "share" ? "Preparing…" : "Share PDF"}</Button><Button tone="line" wide disabled={Boolean(pdfBusy)} onClick={() => void withPdf("save")}>{pdfBusy === "save" ? "Preparing…" : "Save PDF"}</Button></div>{pdfError && <Notice tone="bad" title="PDF export failed" body={pdfError} onDismiss={() => setPdfError("")} />}<button className="exp-format" onClick={() => open(url("xls"))}><span className="exp-format-orb">XLS</span><span className="exp-format-main"><strong>Excel <span>.xls</span></strong><small>Formatted ledger for spreadsheet apps</small></span><IconArrowUpRight size={17} /></button><button className="exp-format" onClick={() => open(url("csv"))}><span className="exp-format-orb">CSV</span><span className="exp-format-main"><strong>CSV <span>.csv</span></strong><small>Plain data for any spreadsheet tool</small></span><IconArrowUpRight size={17} /></button></section><p className="exp-note">PDF style affects the PDF only. Excel and CSV always include the full row data.</p></main>;
}
