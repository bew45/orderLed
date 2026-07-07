import React, { useState } from "react";
import { endpoints, type ScreenshotRow } from "../api";
import { IconTrash, PrimaryButton } from "./ui";

export function ScreenshotList(props: {
  screenshots: ScreenshotRow[];
  onDelete?: (id: string) => Promise<void>;
  limit?: number;
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
      {screenshots.map((shot) => {
        const status = shot.error ? "Failed" : shot.processed_at > 0 ? "Read" : "Uploaded";
        return (
          <article className="uploaded-shot" key={shot.id}>
            <a className="uploaded-shot-thumb" href={endpoints.screenshotImageUrl(shot.id)} target="_blank" rel="noreferrer">
              <img src={endpoints.screenshotImageUrl(shot.id)} alt={shot.original_name} loading="lazy" />
            </a>
            <span className="uploaded-shot-info">
              <strong>{shot.original_name}</strong>
              <small>{shot.width || 0} x {shot.height || 0} / {status}</small>
              {shot.error && <small className="uploaded-shot-error">{shot.error}</small>}
            </span>
            <span className="uploaded-shot-actions">
              <a className={shot.error ? "uploaded-shot-status is-failed" : "uploaded-shot-status"} href={endpoints.screenshotImageUrl(shot.id)} target="_blank" rel="noreferrer">
                Open
              </a>
              {props.onDelete && (
                <PrimaryButton
                  className="btn-sm"
                  variant={confirmId === shot.id ? "danger" : "ghost"}
                  disabled={deletingId === shot.id}
                  onClick={() => handleDelete(shot.id)}
                >
                  <IconTrash size={13} /> {deletingId === shot.id ? "Deleting" : confirmId === shot.id ? "Confirm" : "Delete"}
                </PrimaryButton>
              )}
            </span>
          </article>
        );
      })}
    </div>
  );
}
