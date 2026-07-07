import React from "react";
import { IconFileSheet, IconFileText, IconFilePdf } from "./Icons";
import { InlineAlert } from "./InlineAlert";

export interface ExportActionPanelProps {
  needsReviewCount: number;
  onExportExcel?: () => void;
  onExportCsv?: () => void;
  onExportPdf?: () => void;
  disabled?: boolean;
}

/**
 * Export actions for the reviewed ledger — Excel, CSV, PDF — with an
 * inline warning if rows still need review before exporting.
 */
export function ExportActionPanel({
  needsReviewCount,
  onExportExcel,
  onExportCsv,
  onExportPdf,
  disabled = false,
}: ExportActionPanelProps) {
  const blocked = disabled;

  return (
    <div className="ol-export-panel">
      <p className="ol-export-panel__title">Export report</p>

      <div className="ol-export-grid">
        <button type="button" className="ol-export-btn" disabled={blocked} onClick={onExportExcel}>
          <span className="ol-export-btn__icon" style={{ background: "var(--ol-green-soft)", color: "var(--ol-green)" }}>
            <IconFileSheet width={17} height={17} />
          </span>
          Excel
        </button>
        <button type="button" className="ol-export-btn" disabled={blocked} onClick={onExportCsv}>
          <span className="ol-export-btn__icon" style={{ background: "var(--ol-blue-soft)", color: "var(--ol-blue)" }}>
            <IconFileText width={17} height={17} />
          </span>
          CSV
        </button>
        <button type="button" className="ol-export-btn" disabled={blocked} onClick={onExportPdf}>
          <span className="ol-export-btn__icon" style={{ background: "var(--ol-red-soft)", color: "var(--ol-red)" }}>
            <IconFilePdf width={17} height={17} />
          </span>
          PDF
        </button>
      </div>

      {needsReviewCount > 0 && (
        <InlineAlert
          variant="warning"
          title={`${needsReviewCount} order${needsReviewCount === 1 ? "" : "s"} still need review`}
          message="You can still export, but figures may change once these rows are corrected."
        />
      )}
    </div>
  );
}

export default ExportActionPanel;

/* ---------------------------------------------------------------------------
 * Example usage:
 *
 * <ExportActionPanel
 *   needsReviewCount={6}
 *   onExportExcel={() => console.log("export xlsx (mock)")}
 *   onExportCsv={() => console.log("export csv (mock)")}
 *   onExportPdf={() => console.log("export pdf (mock)")}
 * />
 * ------------------------------------------------------------------------- */
