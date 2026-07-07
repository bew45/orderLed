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

/* ---------- Primitives ---------- */

export function PrimaryButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { block?: boolean; variant?: "primary" | "ghost" | "danger" }
) {
  const { block, variant = "primary", className, ...rest } = props;
  const mapped = variant === "ghost" ? "secondary" : variant === "danger" ? "ghost" : "primary";
  const cls = ["ol-btn", `ol-btn--${mapped}`, block ? "ol-btn--block" : "", variant === "danger" ? "ol-btn--danger" : "", className].filter(Boolean).join(" ");
  return <button className={cls} {...rest} />;
}

export function StatCard(props: { label: string; value: string; tone?: "warn" | "positive" }) {
  return (
    <div className={["stat-card", props.tone].filter(Boolean).join(" ")}>
      <span className="stat-label">{props.label}</span>
      <strong className="stat-value">{props.value}</strong>
    </div>
  );
}

export function StatusPill(props: { state: string }) {
  const state = props.state === "ok" ? "completed" : props.state;
  return (
    <span className={`ol-badge ol-badge--${state}`}>
      <span className="ol-badge__dot" />
      {props.state.replace("_", " ")}
    </span>
  );
}

export function EmptyState(props: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <h3>{props.title}</h3>
      <p>{props.body}</p>
      {props.children}
    </div>
  );
}

export type ProgressStepState = "pending" | "active" | "done" | "error";

export function ProgressSteps(props: { steps: Array<{ label: string; state: ProgressStepState }> }) {
  return (
    <div className="progress-steps">
      {props.steps.map((step) => (
        <div key={step.label} className={`progress-step ${step.state}`}>
          <span className="step-dot">{step.state === "done" ? <IconCheck size={12} /> : step.state === "error" ? "!" : ""}</span>
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

export type TabKey = "home" | "review" | "batches" | "export";

export function TabBar(props: { active: TabKey; reviewBadge?: number; onSelect: (tab: TabKey) => void }) {
  const items: Array<{ key: TabKey; label: string; icon: (p: IconProps) => React.ReactElement }> = [
    { key: "home", label: "Home", icon: IconHome },
    { key: "review", label: "Review", icon: IconReview },
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
            {item.key === "review" && !!props.reviewBadge && <span className="tab-badge">{props.reviewBadge}</span>}
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
    <div className="ol-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div className="ol-sheet" role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="ol-sheet__grabber" />
          <div className="ol-sheet__head">
            <div>
              <span className="ol-sheet__title">{props.title}</span>
              {props.subtitle && <p>{props.subtitle}</p>}
            </div>
            <button className="ol-sheet__close" onClick={props.onClose} aria-label="Close">
              <IconClose size={18} />
            </button>
          </div>
          <div className="ol-sheet__body">{props.children}</div>
          {props.footer && <div className="ol-sheet__footer">{props.footer}</div>}
      </div>
    </div>
  );
}
