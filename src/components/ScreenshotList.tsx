import React, { useMemo, useState } from "react";
import { endpoints, fmtMoney, parseAmountCheck, SOURCE_APP_LABEL, type AmountCheck, type OcrTextRow, type ScreenshotRow } from "../api";
import { Badge, IconEdit, IconTrash, PrimaryButton } from "./ui";

function issueClass(shot: ScreenshotRow) {
  if (shot.error || shot.ocr_status === "failed" || shot.llm_status === "failed") return "uploaded-shot has-issue is-error";
  if (shot.amount_check_state === "mismatch" || shot.amount_check_state === "unavailable") return "uploaded-shot has-issue is-warn";
  return "uploaded-shot";
}

function hasIssue(shot: ScreenshotRow) {
  return Boolean(shot.error)
    || shot.ocr_status === "failed"
    || shot.llm_status === "failed"
    || shot.amount_check_state === "mismatch"
    || shot.amount_check_state === "unavailable";
}

function parseOcrRows(value: string): OcrTextRow[] {
  try {
    const rows = JSON.parse(value || "[]");
    return Array.isArray(rows) ? rows.filter((row) => row && typeof row.text === "string") : [];
  } catch {
    return [];
  }
}

function shotStatus(shot: ScreenshotRow) {
  if (shot.error) return { label: "Failed", badge: "cancelled" };
  if (shot.ocr_status === "running" || shot.llm_status === "running" || shot.ocr_status === "queued" || shot.llm_status === "queued") {
    return { label: "Reading", badge: "unknown" };
  }
  if (shot.processed_at > 0) return { label: "Read", badge: "completed" };
  return { label: "Uploaded", badge: "unknown" };
}

function stepLabel(status: string, idleLabel: string) {
  if (status === "done") return "done";
  if (status === "running") return "running";
  if (status === "queued") return "queued";
  if (status === "failed") return "failed";
  if (status === "skipped") return "off";
  return idleLabel;
}

function engineLabel(engine: string) {
  if (!engine) return "";
  if (engine.startsWith("openrouter:")) {
    const [rawModel, ...metaParts] = engine.slice("openrouter:".length).split("|");
    const meta = new Map(metaParts.map((part) => {
      const [key, ...value] = part.split(":");
      return [key, value.join(":")] as const;
    }));
    const pieces = [`OpenRouter - ${rawModel}`];
    const run = meta.get("run");
    if (run) {
      const date = new Date(run);
      pieces.push(`LLM run ${Number.isNaN(date.getTime()) ? run : date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })}`);
    }
    const shot = meta.get("shot");
    if (shot) pieces.push(`shot ${shot}`);
    return pieces.join(" - ");
  }
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
  onCheck?: (id: string) => void;
  limit?: number;
  showOcr?: boolean;
}) {
  const [confirmId, setConfirmId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({});
  const screenshots = props.limit ? props.screenshots.slice(0, props.limit) : props.screenshots;

  function isExpanded(shot: ScreenshotRow) {
    const override = expandOverrides[shot.id];
    return override === undefined ? hasIssue(shot) : override;
  }

  function toggleExpanded(shot: ScreenshotRow) {
    setExpandOverrides((current) => ({ ...current, [shot.id]: !isExpanded(shot) }));
  }

  function setAllExpanded(value: boolean) {
    setExpandOverrides((current) => {
      const next = { ...current };
      for (const shot of screenshots) next[shot.id] = value;
      return next;
    });
  }

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
      {props.showOcr && screenshots.length > 1 && (
        <div className="uploaded-shot-toolbar">
          <span>{screenshots.length} screenshots</span>
          <span className="uploaded-shot-toolbar-actions">
            <button type="button" className="uploaded-shot-toolbar-btn" onClick={() => setAllExpanded(true)}>Expand all</button>
            <button type="button" className="uploaded-shot-toolbar-btn" onClick={() => setAllExpanded(false)}>Collapse all</button>
          </span>
        </div>
      )}
      {screenshots.map((shot) => (
        <ScreenshotCard
          key={shot.id}
          shot={shot}
          confirmDelete={confirmId === shot.id}
          deleting={deletingId === shot.id}
          showOcr={props.showOcr}
          expanded={props.showOcr ? isExpanded(shot) : true}
          onToggleExpand={props.showOcr ? () => toggleExpanded(shot) : undefined}
          onDelete={props.onDelete ? () => handleDelete(shot.id) : undefined}
          onCheck={props.onCheck && shot.extracted_order_count > 0 ? () => props.onCheck!(shot.id) : undefined}
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
  expanded?: boolean;
  onToggleExpand?: () => void;
  onDelete?: () => void;
  onCheck?: () => void;
}) {
  const rows = useMemo(() => parseOcrRows(props.shot.ocr_text_json), [props.shot.ocr_text_json]);
  const amountCheck = useMemo(() => parseAmountCheck(props.shot.amount_check_json), [props.shot.amount_check_json]);
  const status = shotStatus(props.shot);
  const previewRows = rows.slice(0, 5);
  const appLabel = SOURCE_APP_LABEL[props.shot.source_app_guess] ?? props.shot.source_app_guess ?? "Unknown";
  const expanded = props.expanded ?? true;
  const hasDetail = Boolean(props.showOcr) && (previewRows.length > 0 || (Boolean(amountCheck) && props.shot.processed_at > 0));

  return (
    <article className={issueClass(props.shot)}>
      <a className="uploaded-shot-thumb" href={endpoints.screenshotImageUrl(props.shot.id)} target="_blank" rel="noreferrer">
        <img src={endpoints.screenshotImageUrl(props.shot.id)} alt={props.shot.original_name} loading="lazy" />
      </a>

      <span className="uploaded-shot-info">
        <span className="uploaded-shot-title-row">
          <strong>{props.shot.original_name}</strong>
          <Badge status={status.badge} label={status.label} />
        </span>
        <small className="uploaded-shot-meta">{props.shot.width || 0} x {props.shot.height || 0} / {appLabel}</small>
        <span className="uploaded-shot-metrics">
          <small>
            OCR <span className={`step-status is-${props.shot.ocr_status}`}>{stepLabel(props.shot.ocr_status, `${props.shot.ocr_line_count || rows.length} lines`)}</span>
          </small>
          <small>
            LLM <span className={`step-status is-${props.shot.llm_status}`}>{stepLabel(props.shot.llm_status, "not started")}</span>
          </small>
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
        {(props.shot.error || props.shot.ocr_error || props.shot.llm_error) && (
          <small className="uploaded-shot-error">{props.shot.error || props.shot.llm_error || props.shot.ocr_error}</small>
        )}
      </span>

      <span className="uploaded-shot-actions">
        <a className={props.shot.error ? "uploaded-shot-status is-failed" : "uploaded-shot-status"} href={endpoints.screenshotImageUrl(props.shot.id)} target="_blank" rel="noreferrer">
          Open
        </a>
        {props.onCheck && (
          <PrimaryButton className="btn-sm" variant="ghost" onClick={props.onCheck}>
            <IconEdit size={13} /> Check
          </PrimaryButton>
        )}
        {hasDetail && (
          <button type="button" className="uploaded-shot-toggle" onClick={props.onToggleExpand}>
            {expanded ? "Hide details" : "Show details"}
          </button>
        )}
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

      {props.showOcr && expanded && amountCheck && props.shot.processed_at > 0 && (
        <AmountCheckPanel check={amountCheck} />
      )}

      {props.showOcr && expanded && previewRows.length > 0 && (
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
