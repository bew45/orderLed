import React from "react";

export type ProcessingState = "queued" | "processing" | "done" | "failed";

export interface ProcessingProgressCardProps {
  queued: number;
  processed: number;
  failed: number;
  ordersFound: number;
  total: number;
  state: ProcessingState;
}

const STATE_LABEL: Record<ProcessingState, string> = {
  queued: "Queued",
  processing: "Processing",
  done: "Done",
  failed: "Attention needed",
};

/**
 * Shows the state of a batch of screenshots moving through OCR/extraction:
 * queued → processing → done (or failed), plus how many order rows were found.
 */
export function ProcessingProgressCard({
  queued,
  processed,
  failed,
  ordersFound,
  total,
  state,
}: ProcessingProgressCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <div className="ol-progress-card">
      <div className="ol-progress-card__head">
        <span className="ol-progress-card__title">Processing screenshots</span>
        <span className="ol-progress-card__state" style={state === "failed" ? { color: "var(--ol-red)" } : undefined}>
          {state === "processing" && <span className="ol-progress-card__state-dot" />}
          {STATE_LABEL[state]}
        </span>
      </div>

      <div className="ol-progress-track">
        <div
          className="ol-progress-track__fill"
          style={{
            width: `${pct}%`,
            background: state === "failed" ? "var(--ol-red)" : undefined,
          }}
        />
      </div>

      <div className="ol-progress-stats">
        <div className="ol-progress-stat">
          <div className="ol-progress-stat__value ol-tabular">{queued}</div>
          <div className="ol-progress-stat__label">Queued</div>
        </div>
        <div className="ol-progress-stat">
          <div className="ol-progress-stat__value ol-tabular">{processed}</div>
          <div className="ol-progress-stat__label">Processed</div>
        </div>
        <div className="ol-progress-stat ol-progress-stat--failed">
          <div className="ol-progress-stat__value ol-tabular">{failed}</div>
          <div className="ol-progress-stat__label">Failed</div>
        </div>
        <div className="ol-progress-stat ol-progress-stat--found">
          <div className="ol-progress-stat__value ol-tabular">{ordersFound}</div>
          <div className="ol-progress-stat__label">Orders found</div>
        </div>
      </div>
    </div>
  );
}

export default ProcessingProgressCard;

/* ---------------------------------------------------------------------------
 * Example usage:
 *
 * <ProcessingProgressCard
 *   queued={2}
 *   processed={9}
 *   failed={1}
 *   ordersFound={11}
 *   total={12}
 *   state="processing"
 * />
 * ------------------------------------------------------------------------- */
