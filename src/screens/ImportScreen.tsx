import React, { useState } from "react";
import { ScreenshotList } from "../components/ScreenshotList";
import { EmptyState, IconCamera, IconInbox, PrimaryButton, ProcessingProgressCard } from "../components/ui";
import { useAppData } from "../state/AppData";

export function ImportScreen(props: { onUpload: () => void; onCreateBatch: () => void }) {
  const { activeBatch, summary, screenshots, deleteScreenshot, processActiveBatch } = useAppData();
  const [processing, setProcessing] = useState(false);

  async function handleProcess() {
    setProcessing(true);
    try {
      await processActiveBatch(true);
    } finally {
      setProcessing(false);
    }
  }

  if (!activeBatch) {
    return (
      <div className="screen">
        <EmptyState
          icon={<IconInbox size={24} />}
          title="Start an import"
          body="Create an import session before uploading screenshots."
        >
          <PrimaryButton onClick={props.onCreateBatch}>Create import</PrimaryButton>
        </EmptyState>
      </div>
    );
  }

  const total = summary?.screenshotsTotal ?? screenshots.length;
  const failed = summary?.screenshotsFailed ?? screenshots.filter((shot) => shot.error).length;
  const processed = summary?.screenshotsProcessed ?? screenshots.filter((shot) => shot.processed_at > 0).length;
  const ordersFound = summary?.ordersTotal ?? 0;

  return (
    <div className="screen">
      <div>
        <p className="eyebrow">Import Workspace</p>
        <h2 className="screen-title">{activeBatch.title}</h2>
        <p className="screen-subtitle">Upload, inspect, delete, and retry screenshots here before reading the dashboard.</p>
      </div>

      <ProcessingProgressCard
        queued={Math.max(0, total - processed - failed)}
        processed={processed}
        failed={failed}
        ordersFound={ordersFound}
        total={total}
        state={processing ? "processing" : failed > 0 ? "failed" : processed > 0 ? "done" : "queued"}
      />

      <div className="btn-row">
        <PrimaryButton onClick={props.onUpload}>
          <IconCamera size={16} /> Upload
        </PrimaryButton>
        <PrimaryButton variant="ghost" disabled={total === 0 || processing} onClick={handleProcess}>
          {processing ? "Reading..." : "Retry read"}
        </PrimaryButton>
      </div>

      {screenshots.length === 0 ? (
        <EmptyState
          icon={<IconCamera size={22} />}
          title="No screenshots in this import"
          body="Upload screenshots here. They will stay in this workspace after reload."
        />
      ) : (
        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h3>Uploaded screenshots</h3>
            <span>{screenshots.length} image{screenshots.length === 1 ? "" : "s"}</span>
          </div>
          <ScreenshotList screenshots={screenshots} onDelete={deleteScreenshot} />
        </section>
      )}
    </div>
  );
}
