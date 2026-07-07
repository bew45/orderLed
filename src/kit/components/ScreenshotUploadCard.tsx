import React, { useRef, useState } from "react";
import { IconUpload } from "./Icons";

export interface ScreenshotUploadCardProps {
  /** Number of files currently selected/staged for upload. */
  selectedCount: number;
  /** Of the selected files, how many were detected as duplicates already in the ledger. */
  duplicateCount?: number;
  /** Disable the CTA, e.g. while an upload is already running. */
  isUploading?: boolean;
  /** Called with the FileList when the user picks screenshots (mock: wire up yourself). */
  onFilesSelected?: (files: FileList) => void;
  /** Called when the CTA is pressed to start the upload (mock: wire up yourself). */
  onUploadPress?: () => void;
  title?: string;
  hint?: string;
}

/**
 * Mobile-first upload card for staging food delivery screenshots.
 * Tap-to-select on iPhone (native file picker), drag-and-drop supported
 * where available. Shows selected/duplicate counts as chips before the
 * user commits to uploading.
 */
export function ScreenshotUploadCard({
  selectedCount,
  duplicateCount = 0,
  isUploading = false,
  onFilesSelected,
  onUploadPress,
  title = "Upload delivery screenshots",
  hint = "Grab, LINE MAN, or ShopeeFood — PNG or JPG",
}: ScreenshotUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const hasSelection = selectedCount > 0;

  return (
    <div
      className={`ol-upload-card ${dragActive ? "ol-upload-card--active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files?.length) onFilesSelected?.(e.dataTransfer.files);
      }}
    >
      <div className="ol-upload-card__icon">
        <IconUpload width={22} height={22} />
      </div>
      <p className="ol-upload-card__title">{title}</p>
      <p className="ol-upload-card__hint">{hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFilesSelected?.(e.target.files);
        }}
      />

      <button
        type="button"
        className="ol-upload-card__cta"
        disabled={isUploading}
        onClick={() => (hasSelection ? onUploadPress?.() : inputRef.current?.click())}
      >
        {isUploading
          ? "Uploading…"
          : hasSelection
          ? `Upload ${selectedCount} screenshot${selectedCount === 1 ? "" : "s"}`
          : "Choose screenshots"}
      </button>

      {(hasSelection || duplicateCount > 0) && (
        <div className="ol-upload-card__meta">
          {hasSelection && (
            <span className="ol-chip">{selectedCount} selected</span>
          )}
          {duplicateCount > 0 && (
            <span className="ol-chip ol-chip--warn">{duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default ScreenshotUploadCard;

/* ---------------------------------------------------------------------------
 * Example usage:
 *
 * const [count, setCount] = useState(3);
 *
 * <ScreenshotUploadCard
 *   selectedCount={count}
 *   duplicateCount={1}
 *   onFilesSelected={(files) => setCount(files.length)}
 *   onUploadPress={() => console.log("start upload (mock)")}
 * />
 * ------------------------------------------------------------------------- */
