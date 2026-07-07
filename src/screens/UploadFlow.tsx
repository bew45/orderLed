import React, { useRef, useState } from "react";
import { useAppData } from "../state/AppData";
import { BottomSheet, IconCamera, PrimaryButton, ProgressSteps, type ProgressStepState } from "../components/ui";
import type { BatchSummary, UploadResult } from "../api";

type Step = "pick" | "uploading" | "uploaded" | "processing" | "done" | "error";

export function UploadFlow(props: { onClose: () => void; onReviewNow: () => void }) {
  const { uploadFiles, processActiveBatch } = useAppData();
  const [step, setStep] = useState<Step>("pick");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [processSummary, setProcessSummary] = useState<BatchSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!files.length) return;
    setStep("uploading");
    setErrorMessage("");
    try {
      const result = await uploadFiles(files);
      setUploadResult(result);
      setFiles([]);
      setStep("uploaded");
    } catch (err: any) {
      setErrorMessage(err.message || "Upload failed");
      setStep("error");
    }
  }

  async function handleProcess() {
    setStep("processing");
    setErrorMessage("");
    try {
      const summary = await processActiveBatch(false);
      setProcessSummary(summary);
      setStep("done");
    } catch (err: any) {
      setErrorMessage(err.message || "Reading screenshots failed");
      setStep("error");
    }
  }

  const processingSteps: Array<{ label: string; state: ProgressStepState }> = [
    { label: "Screenshots uploaded", state: "done" },
    { label: "Reading text from screenshots", state: step === "processing" ? "active" : step === "done" ? "done" : step === "error" ? "error" : "pending" },
    { label: "Matching and totaling orders", state: step === "done" ? "done" : "pending" }
  ];

  const footer = step === "done"
    ? (
      <>
        <PrimaryButton variant="ghost" onClick={props.onClose}>Back to dashboard</PrimaryButton>
        <PrimaryButton onClick={props.onReviewNow}>Review now</PrimaryButton>
      </>
    )
    : step === "error"
      ? (
        <>
          <PrimaryButton variant="ghost" onClick={props.onClose}>Close</PrimaryButton>
          <PrimaryButton onClick={() => setStep(uploadResult ? "uploaded" : "pick")}>Try again</PrimaryButton>
        </>
      )
      : undefined;

  return (
    <BottomSheet title="Upload screenshots" subtitle="From Grab, LINE MAN, or ShopeeFood" onClose={props.onClose} footer={footer}>
      {step === "pick" && (
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
            <IconCamera size={28} />
            <strong>Choose screenshots from Photos</strong>
            <span>{files.length > 0 ? `${files.length} screenshot${files.length === 1 ? "" : "s"} selected` : "You can select many at once"}</span>
          </button>
          <PrimaryButton block disabled={!files.length} onClick={handleUpload}>
            Upload {files.length > 0 ? `${files.length} screenshot${files.length === 1 ? "" : "s"}` : ""}
          </PrimaryButton>
        </div>
      )}

      {step === "uploading" && <ProgressSteps steps={[{ label: "Uploading screenshots…", state: "active" }]} />}

      {step === "uploaded" && uploadResult && (
        <div className="stack">
          <div className="banner banner-ok">
            {uploadResult.added.length} added
            {uploadResult.skipped.length > 0 ? ` · ${uploadResult.skipped.length} duplicate skipped` : ""}
          </div>
          <PrimaryButton block variant="ghost" onClick={() => setStep("pick")}>Add more screenshots</PrimaryButton>
          <PrimaryButton block onClick={handleProcess}>Read screenshots</PrimaryButton>
        </div>
      )}

      {(step === "processing" || (step === "done" && processSummary)) && (
        <div className="stack">
          <ProgressSteps steps={processingSteps} />
          {step === "done" && processSummary && (
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Orders found</span>
                <strong className="stat-value">{processSummary.ordersTotal}</strong>
              </div>
              <div className={processSummary.ordersNeedingReview > 0 ? "stat-card warn" : "stat-card"}>
                <span className="stat-label">Needs review</span>
                <strong className="stat-value">{processSummary.ordersNeedingReview}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "error" && (
        <div className="stack">
          <div className="banner banner-danger">{errorMessage}</div>
          <p className="screen-subtitle">
            Configure an OpenRouter API key in Settings for reliable extraction, or fix local OCR setup.
          </p>
        </div>
      )}
    </BottomSheet>
  );
}
