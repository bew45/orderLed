import React, { useEffect } from "react";
import { IconX } from "./Icons";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Sticky footer area, e.g. Save/Cancel buttons. */
  footer?: React.ReactNode;
}

/**
 * Generic mobile bottom sheet: overlay + slide-up panel with a grabber,
 * optional title/close row, scrollable body, and sticky footer. Used
 * directly by OrderEditSheet, and reusable for any other sheet content
 * (e.g. filters, confirmations).
 */
export function BottomSheet({ open, onClose, title, children, footer }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ol-sheet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ol-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ol-sheet__grabber" />
        {title && (
          <div className="ol-sheet__head">
            <span className="ol-sheet__title">{title}</span>
            <button type="button" className="ol-sheet__close" onClick={onClose} aria-label="Close">
              <IconX width={16} height={16} />
            </button>
          </div>
        )}
        <div className="ol-sheet__body">{children}</div>
        {footer && <div className="ol-sheet__footer">{footer}</div>}
      </div>
    </div>
  );
}

export default BottomSheet;

/* ---------------------------------------------------------------------------
 * Example usage:
 *
 * const [open, setOpen] = useState(false);
 *
 * <BottomSheet
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   title="Filter orders"
 *   footer={<button className="ol-btn ol-btn--primary" onClick={() => setOpen(false)}>Apply</button>}
 * >
 *   <p>Any content goes here.</p>
 * </BottomSheet>
 * ------------------------------------------------------------------------- */
