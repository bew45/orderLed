import React from "react";
import { IconCheckCircle, IconAlertTriangle, IconAlertCircle, IconInfo, IconX } from "./Icons";

export type InlineAlertVariant = "success" | "warning" | "error" | "info";

export interface InlineAlertProps {
  variant: InlineAlertVariant;
  title?: string;
  message: string;
  onDismiss?: () => void;
}

const ICONS: Record<InlineAlertVariant, React.ComponentType<any>> = {
  success: IconCheckCircle,
  warning: IconAlertTriangle,
  error: IconAlertCircle,
  info: IconInfo,
};

/**
 * Reusable success / warning / error / info message. Use for form
 * validation, export warnings, upload results, empty-selection notices.
 */
export function InlineAlert({ variant, title, message, onDismiss }: InlineAlertProps) {
  const Icon = ICONS[variant];
  return (
    <div className={`ol-alert ol-alert--${variant}`} role={variant === "error" ? "alert" : "status"}>
      <span className="ol-alert__icon">
        <Icon width={17} height={17} />
      </span>
      <span className="ol-alert__body">
        {title && <div className="ol-alert__title">{title}</div>}
        <div className="ol-alert__message">{message}</div>
      </span>
      {onDismiss && (
        <button type="button" className="ol-alert__close" aria-label="Dismiss" onClick={onDismiss}>
          <IconX width={13} height={13} />
        </button>
      )}
    </div>
  );
}

export default InlineAlert;

/* ---------------------------------------------------------------------------
 * Example usage:
 *
 * <InlineAlert variant="success" title="Export ready" message="orders_july_2026.xlsx has been generated." />
 * <InlineAlert variant="warning" message="6 orders still need review before exporting." />
 * <InlineAlert variant="error" title="Upload failed" message="2 screenshots could not be read. Try re-uploading." />
 * <InlineAlert variant="info" message="Duplicate screenshots are skipped automatically." />
 * ------------------------------------------------------------------------- */
