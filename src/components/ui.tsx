import React from "react";

type IconProps = { size?: number; className?: string };

function svg(path: React.ReactNode) {
  return function Icon({ size = 20, className }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        {path}
      </svg>
    );
  };
}

export const IconHome = svg(
  <path d="M4 11.5 12 4l8 7.5M6 9.5V19a1 1 0 0 0 1 1h3v-5a2 2 0 1 1 4 0v5h3a1 1 0 0 0 1-1V9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
);

export const IconReview = svg(
  <>
    <rect x="4.5" y="3.5" width="15" height="17" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </>
);

export const IconHistory = svg(
  <>
    <path d="M4 12a8 8 0 1 1 2.6 5.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M4 6v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8v4.3l3 1.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconExport = svg(
  <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
);

export const IconGear = svg(
  <>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.6a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V2.6a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </>
);

export const IconStar = svg(
  <path d="m12 3.5 2.5 5.3 5.8.7-4.3 4 1.1 5.8-5.1-2.9-5.1 2.9 1.1-5.8-4.3-4 5.8-.7Z" fill="currentColor" />
);

export const IconStarOutline = svg(
  <path d="m12 3.5 2.5 5.3 5.8.7-4.3 4 1.1 5.8-5.1-2.9-5.1 2.9 1.1-5.8-4.3-4 5.8-.7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
);

export const IconCheck = svg(
  <path d="M5 12.5 9.5 17 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
);

export const IconChevronRight = svg(
  <path d="m9 5.5 7 6.5-7 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
);

export const IconClose = svg(
  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
);

export const IconCamera = svg(
  <>
    <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h1.7l1-1.8A1 1 0 0 1 9.1 4.6h5.8a1 1 0 0 1 .9.6l1 1.8h1.7A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.4" stroke="currentColor" strokeWidth="1.6" />
  </>
);

export const IconPlus = svg(
  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
);

export const IconTrash = svg(
  <path d="M5 7h14M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M7.5 7l.7 12a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
);

export const IconEye = svg(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.5" />
  </>
);

export const IconEyeOff = svg(
  <path d="M3.5 3.5l17 17M9.9 9.9a2.6 2.6 0 0 0 3.6 3.6M6.6 6.7C4.3 8.2 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.1-.5 4.3-1.2M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15 15 0 0 1-2.9 3.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
);

export const IconInbox = svg(
  <>
    <path d="M4 12h4l1.5 3h5L16 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 12 4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1l-1 6M4 12v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconChart = svg(
  <>
    <path d="M4.5 19.5h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <rect x="6" y="11" width="3.5" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
    <rect x="10.25" y="7" width="3.5" height="10" rx="1" stroke="currentColor" strokeWidth="1.6" />
    <rect x="14.5" y="4.5" width="3.5" height="12.5" rx="1" stroke="currentColor" strokeWidth="1.6" />
  </>
);

export const IconCheckCircle = svg(
  <>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8.5 12.3l2.4 2.4 4.6-5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconAlertTriangle = svg(
  <>
    <path d="M12 4.5 21 19H3L12 4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M12 10v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="12" cy="16.6" r="0.9" fill="currentColor" />
  </>
);

/* ---------- Primitives ---------- */

export function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { block?: boolean; variant?: "primary" | "ghost" | "danger" }
) {
  const { block, variant = "primary", className, ...rest } = props;
  const cls = ["btn", `btn-${variant}`, block ? "btn-block" : "", className].filter(Boolean).join(" ");
  return <button className={cls} {...rest} />;
}

export function StatCard(props: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={["stat-card", props.tone === "warn" ? "warn" : ""].filter(Boolean).join(" ")}>
      <span className="stat-label">{props.label}</span>
      <strong className="stat-value tabular">{props.value}</strong>
    </div>
  );
}

export function Badge(props: { status: string; label?: string }) {
  const labels: Record<string, string> = {
    completed: "Completed",
    cancelled: "Cancelled",
    refunded: "Refunded",
    unknown: "Unknown",
    needs_review: "Needs review",
    corrected: "Corrected",
    ok: "OK"
  };
  return (
    <span className={`badge badge--${props.status}`}>
      <span className="badge-dot" />
      {props.label ?? labels[props.status] ?? props.status}
    </span>
  );
}

export type AlertVariant = "success" | "warning" | "error" | "info";

const ALERT_ICON: Record<AlertVariant, (p: IconProps) => React.ReactElement> = {
  success: IconCheckCircle,
  warning: IconAlertTriangle,
  error: IconAlertTriangle,
  info: IconInbox
};

export function Alert(props: { variant: AlertVariant; title?: string; message: string; onDismiss?: () => void }) {
  const Icon = ALERT_ICON[props.variant];
  return (
    <div className={`alert alert--${props.variant}`} role={props.variant === "error" ? "alert" : "status"}>
      <span className="alert-icon"><Icon size={17} /></span>
      <span className="alert-body">
        {props.title && <div className="alert-title">{props.title}</div>}
        <div className="alert-message">{props.message}</div>
      </span>
      {props.onDismiss && (
        <button type="button" className="icon-btn-sm" aria-label="Dismiss" onClick={props.onDismiss}>
          <IconClose size={13} />
        </button>
      )}
    </div>
  );
}

export function EmptyState(props: { icon?: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      {props.icon && <div className="empty-icon">{props.icon}</div>}
      <h3>{props.title}</h3>
      <p>{props.body}</p>
      {props.children}
    </div>
  );
}

export type ProcessingState = "queued" | "processing" | "done" | "failed";

export function ProcessingProgressCard(props: {
  queued: number;
  processed: number;
  failed: number;
  ordersFound: number;
  total: number;
  state: ProcessingState;
}) {
  const pct = props.total > 0 ? Math.min(100, Math.round((props.processed / props.total) * 100)) : 0;
  const stateLabel: Record<ProcessingState, string> = {
    queued: "Queued",
    processing: "Processing",
    done: "Done",
    failed: "Attention needed"
  };
  const failed = props.state === "failed";
  return (
    <div className="card">
      <div className="progress-card-head">
        <span className="progress-card-title">Reading screenshots</span>
        <span className={failed ? "progress-card-state is-failed" : "progress-card-state"}>
          {props.state === "processing" && <span className="progress-state-dot" />}
          {stateLabel[props.state]}
        </span>
      </div>
      <div className="progress-track">
        <div className={failed ? "progress-track-fill is-failed" : "progress-track-fill"} style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-stats">
        <div className="progress-stat">
          <div className="progress-stat-value tabular">{props.queued}</div>
          <div className="progress-stat-label">Queued</div>
        </div>
        <div className="progress-stat">
          <div className="progress-stat-value tabular">{props.processed}</div>
          <div className="progress-stat-label">Processed</div>
        </div>
        <div className="progress-stat progress-stat--failed">
          <div className="progress-stat-value tabular">{props.failed}</div>
          <div className="progress-stat-label">Failed</div>
        </div>
        <div className="progress-stat progress-stat--found">
          <div className="progress-stat-value tabular">{props.ordersFound}</div>
          <div className="progress-stat-label">Found</div>
        </div>
      </div>
    </div>
  );
}

export type TabKey = "import" | "home" | "batches" | "export";

export function TabBar(props: { active: TabKey; attentionCount?: number; onSelect: (tab: TabKey) => void }) {
  const items: Array<{ key: TabKey; label: string; icon: (p: IconProps) => React.ReactElement }> = [
    { key: "import", label: "Import", icon: IconCamera },
    { key: "home", label: "Dash", icon: IconChart },
    { key: "batches", label: "History", icon: IconHistory },
    { key: "export", label: "Export", icon: IconExport }
  ];
  return (
    <div className="tab-bar-dock">
      <nav className="tab-bar">
        {items.map((item) => (
          <button
            key={item.key}
            className={item.key === props.active ? "tab-item active" : "tab-item"}
            onClick={() => props.onSelect(item.key)}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
            {item.key === "home" && !!props.attentionCount && <span className="tab-badge">{props.attentionCount}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

export function BottomSheet(props: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="sheet-overlay">
      <button className="sheet-scrim" onClick={props.onClose} aria-label="Close" />
      <div className="sheet-dock">
        <section className="sheet-card">
          <div className="sheet-handle" />
          <div className="sheet-head">
            <div>
              <h2>{props.title}</h2>
              {props.subtitle && <p>{props.subtitle}</p>}
            </div>
            <button className="icon-btn" onClick={props.onClose} aria-label="Close">
              <IconClose size={18} />
            </button>
          </div>
          <div className="sheet-body">{props.children}</div>
          {props.footer && <div className="sheet-footer">{props.footer}</div>}
        </section>
      </div>
    </div>
  );
}
