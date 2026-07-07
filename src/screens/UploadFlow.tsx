import React, { useEffect, useMemo, useRef, useState } from "react";
import type { UploadResult } from "../api";
import { Alert, BottomSheet, IconCamera, IconTrash, PrimaryButton } from "../components/ui";
import { useAppData } from "../state/AppData";

type Phase = "pick" | "uploaded" | "error";

export function UploadFlow(props: { onClose: () => void; onDone: () => void }) {
  const { uploadFiles } = useAppData();
  const [phase, setPhase] = useState<Phase>("pick");
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function selectFiles(nextFiles: FileList | null) {
    setFiles(nextFiles ? Array.from(nextFiles) : []);
    setUploadResult(null);
    setErrorMessage("");
    setPhase("pick");
  }

  function removeSelectedFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (!files.length) return;
    setIsUploading(true);
    setErrorMessage("");
    try {
      const result = await uploadFiles(files);
      setUploadResult(result);
      setFiles([]);
      setPhase("uploaded");
    } catch (err: any) {
      setErrorMessage(err.message || "Upload failed");
      setPhase("error");
    } finally {
      setIsUploading(false);
    }
  }

  const footer = phase === "uploaded"
    ? (
      <>
        <PrimaryButton variant="ghost" onClick={() => setPhase("pick")}>Add more</PrimaryButton>
        <PrimaryButton onClick={props.onDone}>View files</PrimaryButton>
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
    <BottomSheet title="Upload screenshots" subtitle="Choose files first, then read them from the import workspace." onClose={props.onClose} footer={footer}>
      {phase === "pick" && (
        <div className="stack">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*"
            hidden
            onChange={(event) => selectFiles(event.target.files)}
          />
          <button className="upload-picker" onClick={() => inputRef.current?.click()}>
            <span className="upload-picker-icon"><IconCamera size={24} /></span>
            <strong>Choose screenshots from Photos</strong>
            <span>{files.length > 0 ? `${files.length} screenshot${files.length === 1 ? "" : "s"} selected` : "You can select many at once"}</span>
          </button>

          {files.length > 0 && (
            <div className="selected-file-list">
              {files.map((file, index) => (
                <SelectedFileRow
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  file={file}
                  onRemove={() => removeSelectedFile(index)}
                />
              ))}
            </div>
          )}

          <PrimaryButton block disabled={!files.length || isUploading} onClick={handleUpload}>
            {isUploading ? "Uploading..." : `Upload ${files.length > 0 ? `${files.length} screenshot${files.length === 1 ? "" : "s"}` : ""}`}
          </PrimaryButton>
        </div>
      )}

      {phase === "uploaded" && uploadResult && (
        <div className="stack">
          <Alert
            variant="success"
            title={`${uploadResult.added.length} screenshot${uploadResult.added.length === 1 ? "" : "s"} added`}
            message={uploadResult.skipped.length > 0 ? `${uploadResult.skipped.length} duplicate${uploadResult.skipped.length === 1 ? "" : "s"} skipped. Open the import workspace to read the files.` : "Open the import workspace to inspect and read the files."}
          />
          <PrimaryButton block variant="ghost" onClick={() => setPhase("pick")}>Add more screenshots</PrimaryButton>
        </div>
      )}

      {phase === "error" && (
        <div className="stack">
          <Alert variant="error" title="Couldn't upload screenshots" message={errorMessage} />
          <p className="screen-subtitle">
            The selected images are still on your phone. Try again or create a fresh import session.
          </p>
        </div>
      )}
    </BottomSheet>
  );
}

function SelectedFileRow(props: { file: File; onRemove: () => void }) {
  const previewUrl = useMemo(() => URL.createObjectURL(props.file), [props.file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div className="selected-file-row">
      <span className="selected-file-thumb">
        <img src={previewUrl} alt="" />
      </span>
      <span className="selected-file-main">
        <strong>{props.file.name}</strong>
        <small>{Math.max(1, Math.round(props.file.size / 1024))} KB</small>
      </span>
      <button className="icon-btn-sm" type="button" onClick={props.onRemove} aria-label="Remove selected file">
        <IconTrash size={14} />
      </button>
    </div>
  );
}
