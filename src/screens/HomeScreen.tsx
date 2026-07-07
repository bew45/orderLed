import React from "react";
import { fmtMoney, fmtMonthLabel } from "../api";
import { useAppData } from "../state/AppData";
import { EmptyState } from "../kit/components/EmptyState";
import { ProcessingProgressCard } from "../kit/components/ProcessingProgressCard";
import { ScreenshotUploadCard } from "../kit/components/ScreenshotUploadCard";
import { SummaryMetricCard } from "../kit/components/SummaryMetricCard";

export function HomeScreen(props: { onUpload: () => void; onReview: () => void; onCreateBatch: () => void }) {
  const { activeBatch, summary } = useAppData();

  if (!activeBatch) {
    return (
      <div className="screen">
        <EmptyState
          kind="custom"
          title="Start your first month"
          description="Create a batch, then upload delivery screenshots from Grab, LINE MAN, or ShopeeFood to build your ledger."
          actionLabel="Create batch"
          onAction={props.onCreateBatch}
        />
      </div>
    );
  }

  const needsReview = summary?.ordersNeedingReview ?? 0;
  const screenshotsTotal = summary?.screenshotsTotal ?? 0;
  const screenshotsProcessed = summary?.screenshotsProcessed ?? 0;
  const screenshotsFailed = summary?.screenshotsFailed ?? 0;
  const progressState = screenshotsFailed > 0
    ? "failed"
    : screenshotsTotal > 0 && screenshotsProcessed >= screenshotsTotal
      ? "done"
      : screenshotsTotal > 0
        ? "processing"
        : "queued";

  return (
    <div className="screen">
      <div>
        <p className="ol-eyebrow">{fmtMonthLabel(activeBatch.month)}</p>
        <h2 className="screen-title">{activeBatch.title}</h2>
      </div>

      <div className="ol-metric-grid">
        <SummaryMetricCard label="Net spend" value={`฿${fmtMoney(summary?.netSpend ?? 0)}`} accentColor="var(--ol-brand)" />
        <SummaryMetricCard label="Completed" value={`฿${fmtMoney(summary?.completedSpend ?? 0)}`} accentColor="var(--ol-green)" />
        <SummaryMetricCard label="Orders" value={String(summary?.ordersTotal ?? 0)} unit="rows" accentColor="var(--ol-blue)" />
        <SummaryMetricCard
          label="Needs review"
          value={String(needsReview)}
          deltaLabel={needsReview > 0 ? "clear before export" : "all clear"}
          deltaDirection={needsReview > 0 ? "down" : "flat"}
          accentColor={needsReview > 0 ? "var(--ol-amber)" : "var(--ol-green)"}
        />
      </div>

      <ScreenshotUploadCard
        selectedCount={0}
        title="Upload this month's screenshots"
        hint="Choose many iPhone screenshots from Photos."
        onUploadPress={props.onUpload}
        onFilesSelected={() => props.onUpload()}
      />

      {screenshotsTotal > 0 && (
        <ProcessingProgressCard
          queued={Math.max(0, screenshotsTotal - screenshotsProcessed)}
          processed={screenshotsProcessed}
          failed={screenshotsFailed}
          ordersFound={summary?.ordersTotal ?? 0}
          total={screenshotsTotal}
          state={progressState}
        />
      )}

      {needsReview > 0 && (
        <button className="ol-btn ol-btn--secondary" onClick={props.onReview}>
          Review {needsReview} row{needsReview === 1 ? "" : "s"}
        </button>
      )}

      <div className="insights-teaser">
        <p className="ol-eyebrow">Coming soon</p>
        <p>Spending insights, restaurant trends, spend by app, and eating-pattern analytics will live here once extraction accuracy is solid.</p>
      </div>
    </div>
  );
}
