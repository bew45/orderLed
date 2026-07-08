import React, { useMemo, useState } from "react";
import { endpoints, fmtMoney, SOURCE_APP_LABEL, type AmountCheck, type OcrTextRow, type ScreenshotRow } from "../api";
import { Badge, IconTrash, PrimaryButton } from "./ui";

function parseOcrRows(value: string): OcrTextRow[] {
  try {
    const rows = JSON.parse(value || "[]");
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row.text === "string") : [];
  } catch {
    return [];
  }
}

function parseAmountCheck(value: string): AmountCheck | null {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || typeof parsed.state !== "string") return null;
    return {
      state: parsed.state,
      aiAmounts: Array.isArray(parsed.aiAmounts) ? parsed.aiAmounts.map(Number).filter(Number.isFinite) : [],
      scannerAmounts: Array.isArray(parsed.scannerAmounts) ? parsed.scannerAmounts.map(Number).filter(Number.isFinite) : [],
      missingFromAi: Array.isArray(parsed.missingFromAi) ? parsed.missingFromAi.map(Number).filter(Number.isFinite) : [],
      missingFromScanner: Array.isArray(parsed.missingFromScanner) ? parsed.missingFromScanner.map(Number).filter(Number.isFinite) : [],
      sumAi: Number(parsed.sumAi || 0),
      sumScanner: Number(parsed.sumScanner || 0),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [],
      aiCandidates: Array.isArray(parsed.aiCandidates) ? parsed.aiCandidates : [],
      scannerCandidates: Array.isArray(parsed.scannerCandidates) ? parsed.scannerCandidates : []
    };
  } catch {
    return null;
  }
}

function shotStatus(shot: ScreenshotRow) {
  if (shot.error) return { label: "Failed", badge: "cancelled" };
  if (shot.processed_at > 0) return { label: "Read", badge: "completed" };
  return { label: "Uploaded", badge: "unknown" };
}

function engineLabel(engine: string) {
  if (!engine) return "";
  if (engine.startsWith("openrouter:")) return `OpenRouter · ${engine.slice("openrouter:".length)}`;
  return engine;
}

function amountCheckLabel(state: string) {
  if (state === "matched") return "Numbers matched";
  if (state === "mismatch") return "Needs check";
  if (state === "unavailable") return "Not verified";
  return "Not checked";
}

function moneyList(values: number[]) {
  if (values.length === 0) return "none";
  return values.map((value) => `THB ${fmtMoney(value)}`).join(", ");
}

export function ScreenshotList(props: {
  screenshots: ScreenshotRow[];
  onDelete?: (id: string) => Promise<void>;
  limit?: number;
  showOcr?: boolean;
}) {
  const [confirmId, setConfirmId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const screenshots = props.limit ? props.screenshots.slice(0, props.limit) : props.screenshots;

  async function handleDelete(id: string) {
    if (!props.onDelete) return;
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setDeletingId(id);
    try {
      await props.onDelete(id);
      setConfirmId("");
    } finally {
      setDeletingId("");
    }
  }

  if (screenshots.length === 0) {
    return null;
  }

  return (
    <div className="uploaded-shot-list">
      {screenshots.map((shot) => (
        <ScreenshotCard
          key={shot.id}
          shot={shot}
          confirmDelete={confirmId === shot.id}
          deleting={deletingId === shot.id}
          showOcr={props.showOcr}
          onDelete={props.onDelete ? () => handleDelete(shot.id) : undefined}
        />
      ))}
    </div>
  );
}

function ScreenshotCard(props: {
  shot: ScreenshotRow;
  confirmDelete: boolean;
  deleting: boolean;
  showOcr?: boolean;
  onDelete?: () => void;
}) {
  const rows = useMemo(() => parseOcrRows(props.shot.ocr_text_json), [props.shot.ocr_text_json]);
  const amountCheck = useMemo(() => parseAmountCheck(props.shot.amount_check_json), [props.shot.amount_check_json]);
  const status = shotStatus(props.shot);
  const previewRows = rows.slice(0, 5);
  const appLabel = SOURCE_APP_LABEL[props.shot.source_app_guess] ?? props.shot.source_app_guess ?? "Unknown";

  return (
    <article className="uploaded-shot">
      <a className="uploaded-shot-thumb" href={endpoints.screenshotImageUrl(props.shot.id)} target="_blank" rel="noreferrer">
        <img src={endpoints.screenshotImageUrl(props.shot.id)} alt={props.shot.original_name} loading="lazy" />
      </a>

      <span className="uploaded-shot-info">
        <span className="uploaded-shot-title-row">
          <strong>{props.shot.original_name}</strong>
          <Badge status={status.badge} label={status.label} />
        </span>
        <small>{props.shot.width || 0} x {props.shot.height || 0} / {appLabel}</small>
        <span className="uploaded-shot-metrics">
          <small>{props.shot.ocr_line_count || rows.length} OCR lines</small>
          <small>{props.shot.extracted_order_count || 0} rows</small>
        </span>
        {props.shot.processed_at > 0 && amountCheck && (
          <span className="uploaded-shot-check-row">
            <Badge status={amountCheck.state} label={amountCheckLabel(amountCheck.state)} />
            <small>{amountCheck.aiAmounts.length} AI / {amountCheck.scannerAmounts.length} OCR</small>
          </span>
        )}
        {props.shot.processed_at > 0 && engineLabel(props.shot.extraction_engine) && (
          <small className="uploaded-shot-engine">Read with {engineLabel(props.shot.extraction_engine)}</small>
        )}
        {props.shot.error && <small className="uploaded-shot-error">{props.shot.error}</small>}
      </span>

      <span className="uploaded-shot-actions">
        <a className={props.shot.error ? "uploaded-shot-status is-failed" : "uploaded-shot-status"} href={endpoints.screenshotImageUrl(props.shot.id)} target="_blank" rel="noreferrer">
          Open
        </a>
        {props.onDelete && (
          <PrimaryButton
            className="btn-sm"
            variant={props.confirmDelete ? "danger" : "ghost"}
            disabled={props.deleting}
            onClick={props.onDelete}
          >
            <IconTrash size={13} /> {props.deleting ? "Deleting" : props.confirmDelete ? "Confirm" : "Delete"}
          </PrimaryButton>
        )}
      </span>

      {props.showOcr && amountCheck && props.shot.processed_at > 0 && (
        <AmountCheckPanel check={amountCheck} />
      )}

      {props.showOcr && previewRows.length > 0 && (
        <div className="uploaded-shot-ocr">
          <div className="uploaded-shot-ocr-head">
            <span>OCR result</span>
            <span>{rows.length} lines</span>
          </div>
          <div className="ocr-line-list">
            {previewRows.map((row, index) => (
              <div className="ocr-line-row" key={row.id || `${props.shot.id}-${index}`}>
                <span className="ocr-line-index tabular">{index + 1}</span>
                <span>{row.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function AmountCheckPanel(props: { check: AmountCheck }) {
  const { check } = props;
  const title = check.state === "matched"
    ? `${check.aiAmounts.length} amount${check.aiAmounts.length === 1 ? "" : "s"} matched`
    : check.state === "mismatch"
      ? "Amount mismatch"
      : "Amount check unavailable";
  return (
    <div className={`amount-check-panel amount-check-panel--${check.state}`}>
      <div className="amount-check-head">
        <strong>{title}</strong>
        <span>AI THB {fmtMoney(check.sumAi)} / OCR THB {fmtMoney(check.sumScanner)}</span>
      </div>
      <div className="amount-check-grid">
        <AmountList title="AI orders" values={check.aiAmounts} />
        <AmountList title="OCR screen" values={check.scannerAmounts} />
      </div>
      {(check.missingFromAi.length > 0 || check.missingFromScanner.length > 0) && (
        <div className="amount-check-missing">
          {check.missingFromAi.length > 0 && <span>Missing from AI: {moneyList(check.missingFromAi)}</span>}
          {check.missingFromScanner.length > 0 && <span>Missing from OCR: {moneyList(check.missingFromScanner)}</span>}
        </div>
      )}
      {check.reasons.length > 0 && (
        <div className="amount-check-reasons">{check.reasons.join(" / ")}</div>
      )}
    </div>
  );
}

function AmountList(props: { title: string; values: number[] }) {
  return (
    <div className="amount-check-list">
      <span>{props.title}</span>
      {props.values.length === 0 ? (
        <small>None</small>
      ) : (
        props.values.map((value, index) => (
          <small key={`${props.title}-${index}-${value}`}><b>{index + 1}.</b> THB {fmtMoney(value)}</small>
        ))
      )}
    </div>
  );
}
