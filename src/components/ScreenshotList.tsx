import React, { useMemo, useState } from "react";
import { endpoints, SOURCE_APP_LABEL, type OcrTextRow, type ScreenshotRow } from "../api";
import { Badge, IconTrash, PrimaryButton } from "./ui";

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
  if (shot.processed_at > 0) return { label: "Read", badge: "completed" };
  return { label: "Uploaded", badge: "unknown" };
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

      {props.showOcr && (rows.length > 0 || props.shot.processed_at > 0 || props.shot.error) && (
        <div className="uploaded-shot-ocr">
          <div className="uploaded-shot-ocr-head">
            <span>OCR result</span>
            <span>{rows.length} lines</span>
          </div>
          {previewRows.length > 0 ? (
            <div className="ocr-line-list">
              {previewRows.map((row, index) => (
                <div className="ocr-line-row" key={row.id || `${props.shot.id}-${index}`}>
                  <span className="ocr-line-index tabular">{index + 1}</span>
                  <span>{row.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="ocr-empty">No OCR text stored for this screenshot.</p>
          )}
        </div>
      )}
    </article>
  );
}
