import React, { useRef, useState } from "react";
import { useAppData } from "../state/AppData";
import { Alert, BottomSheet, IconCamera, PrimaryButton, ProcessingProgressCard } from "../components/ui";
import type { BatchSummary, UploadResult } from "../api";

type Phase = "pick" | "uploaded" | "processing" | "done" | "error";

export function UploadFlow(props: { onClose: () => void; onDone: () => void }) {
  const { uploadFiles, processActiveBatch } = useAppData();
  const [phase, setPhase] = useState<Phase>("pick");
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [processSummary, setProcessSummary] = useState<BatchSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!files.length) return;
    setIsUploading(true);
    setIsProcessing(false);
    setErrorMessage("");
    try {
      const result = await uploadFiles(files);
      setUploadResult(result);
      setFiles([]);
      if (result.added.length === 0) {
        setPhase("uploaded");
        return;
      }
      setPhase("processing");
      setIsProcessing(true);
      const summary = await processActiveBatch(false);
      setProcessSummary(summary);
      setPhase("done");
    } catch (err: any) {
      setErrorMessage(err.message || "Upload failed");
      setPhase("error");
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  }

  const footer = phase === "done"
    ? (
      <>
        <PrimaryButton onClick={props.onDone}>View summary</PrimaryButton>
      </>
    )
    : phase === "error"
      ? (
        <>
          <PrimaryButton variant="ghost" onClick={props.onClose}>Close</PrimaryButton>
          <PrimaryButton onClick={() => setPhase(uploadResult ? "uploaded" : "pick")}>Try again</PrimaryButton>
        </>
      )
      : undefined;

  return (
    <BottomSheet title="Upload screenshots" subtitle="From Grab, LINE MAN, or ShopeeFood" onClose={props.onClose} footer={footer}>
      {phase === "pick" && (
        <div className="stack">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*"
            hidden
            onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
          />
          <button className="upload-picker" onClick={() => inputRef.current?.click()}>
            <span className="upload-picker-icon"><IconCamera size={24} /></span>
            <strong>Choose screenshots from Photos</strong>
            <span>{files.length > 0 ? `${files.length} screenshot${files.length === 1 ? "" : "s"} selected` : "You can select many at once"}</span>
          </button>
          <PrimaryButton block disabled={!files.length || isUploading} onClick={handleUpload}>
            {isUploading ? "Uploading…" : `Upload ${files.length > 0 ? `${files.length} screenshot${files.length === 1 ? "" : "s"}` : ""}`}
          </PrimaryButton>
        </div>
      )}

      {phase === "uploaded" && uploadResult && (
        <div className="stack">
          <Alert
            variant="success"
            title={`${uploadResult.added.length} screenshot${uploadResult.added.length === 1 ? "" : "s"} added`}
            message={uploadResult.skipped.length > 0 ? `${uploadResult.skipped.length} duplicate${uploadResult.skipped.length === 1 ? "" : "s"} skipped automatically.` : "No new screenshots to read."}
          />
          <PrimaryButton block variant="ghost" onClick={() => setPhase("pick")}>Add more screenshots</PrimaryButton>
        </div>
      )}

      {(phase === "processing" || phase === "done") && (
        <ProcessingProgressCard
          queued={isProcessing ? files.length : 0}
          processed={processSummary?.screenshotsProcessed ?? 0}
          failed={processSummary?.screenshotsFailed ?? 0}
          ordersFound={processSummary?.ordersTotal ?? 0}
          total={processSummary?.screenshotsTotal ?? uploadResult?.added.length ?? 0}
          state={isProcessing ? "processing" : (processSummary?.screenshotsFailed ?? 0) > 0 ? "failed" : "done"}
        />
      )}

      {phase === "error" && (
        <div className="stack">
          <Alert variant="error" title="Couldn't finish that step" message={errorMessage} />
          <p className="screen-subtitle">
            Configure an OpenRouter API key in Settings for reliable extraction, or fix local OCR setup.
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
