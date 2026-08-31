import React, { createContext, useCallback, useContext, useRef, useState } from "react";

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

export const IconChevronLeft = svg(
  <path d="m15 5.5-7 6.5 7 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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

export const IconEdit = svg(
  <>
    <path d="M4.5 19.5h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M6.5 15.8 15.8 6.5a2.1 2.1 0 0 1 3 3l-9.3 9.3-4 .9Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconRefresh = svg(
  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
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

export const IconImage = svg(
  <>
    <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    <path d="m5 17 4.5-4 3.5 3 2.5-2 3.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </>
);

export const IconSparkle = svg(
  <path d="M12 4c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6ZM18.5 15.5c.3 1.6 1 2.4 2.5 2.7-1.5.3-2.2 1.1-2.5 2.7-.3-1.6-1-2.4-2.5-2.7 1.5-.3 2.2-1.1 2.5-2.7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
);

export const IconArrowUpRight = svg(
  <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
);

export const IconInfo = svg(
  <>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 11v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="12" cy="8" r="0.9" fill="currentColor" />
  </>
);

/* ============ Primitives ============ */

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "ink" | "line" | "bad";
    wide?: boolean;
    slim?: boolean;
  }
) {
  const { tone = "ink", wide, slim, className, ...rest } = props;
  const cls = ["btn", `btn-${tone}`, wide ? "btn-wide" : "", slim ? "btn-slim" : "", className]
    .filter(Boolean)
    .join(" ");
  return <button className={cls} {...rest} />;
}

/** Small round status tag: dot + label, tinted by tone. */
export function Tag(props: { tone?: "ok" | "warn" | "bad" | "inkfill" | "plain"; children: React.ReactNode }) {
  const tone = props.tone && props.tone !== "plain" ? ` ${props.tone}` : "";
  return <span className={`tag${tone}`}>{props.children}</span>;
}

const ORDER_STATE_TONE: Record<string, "ok" | "warn" | "bad" | "plain"> = {
  completed: "ok",
  matched: "ok",
  ok: "ok",
  corrected: "ok",
  needs_check: "warn",
  mismatch: "warn",
  unavailable: "warn",
  not_checked: "plain",
  unknown: "plain",
  cancelled: "plain",
  refunded: "bad"
};

const ORDER_STATE_LABEL: Record<string, string> = {
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  unknown: "Unknown",
  needs_check: "Needs check",
  corrected: "Corrected",
  ok: "OK",
  matched: "Matched",
  mismatch: "Mismatch",
  unavailable: "Not verified",
  not_checked: "Not checked"
};

/** Status tag with the app-wide status → tone mapping baked in. */
export function StateTag(props: { state: string; label?: string }) {
  return (
    <Tag tone={ORDER_STATE_TONE[props.state] ?? "plain"}>
      {props.label ?? ORDER_STATE_LABEL[props.state] ?? props.state}
    </Tag>
  );
}

export type NoticeTone = "ok" | "warn" | "bad" | "plain";

const NOTICE_ICON: Record<NoticeTone, (p: IconProps) => React.ReactElement> = {
  ok: IconCheckCircle,
  warn: IconAlertTriangle,
  bad: IconAlertTriangle,
  plain: IconInfo
};

export function Notice(props: { tone: NoticeTone; title?: string; body: string; onDismiss?: () => void }) {
  const Icon = NOTICE_ICON[props.tone];
  const cls = props.tone === "plain" ? "notice" : `notice ${props.tone}`;
  return (
    <div className={cls} role={props.tone === "bad" ? "alert" : "status"}>
      <Icon size={16} />
      <span className="notice-body">
        {props.title && <strong>{props.title}</strong>}
        <p>{props.body}</p>
      </span>
      {props.onDismiss && (
        <button type="button" className="notice-x" aria-label="Dismiss" onClick={props.onDismiss}>
          <IconClose size={13} />
        </button>
      )}
    </div>
  );
}

export function Empty(props: { icon?: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      {props.icon && <div className="empty-orb">{props.icon}</div>}
      <h3>{props.title}</h3>
      <p>{props.body}</p>
      {props.children}
    </div>
  );
}

export function Switch(props: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; title: string; caption?: string }) {
  return (
    <label className="switch-row" style={props.disabled ? { opacity: 0.5 } : undefined}>
      <span>
        <strong>{props.title}</strong>
        {props.caption && <small>{props.caption}</small>}
      </span>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span className={props.checked ? "switch on" : "switch"} aria-hidden="true"><i /></span>
    </label>
  );
}

export type TabKey = "import" | "home" | "batches" | "export";

export function Dock(props: { active: TabKey; attentionCount?: number; onSelect: (tab: TabKey) => void }) {
  const items: Array<{ key: TabKey; label: string; icon: (p: IconProps) => React.ReactElement }> = [
    { key: "import", label: "Import", icon: IconCamera },
    { key: "home", label: "Dashboard", icon: IconChart },
    { key: "batches", label: "History", icon: IconHistory },
    { key: "export", label: "Export", icon: IconExport }
  ];
  return (
    <nav className="dock">
      {items.map((item) => (
        <button
          key={item.key}
          className={item.key === props.active ? "dock-item on" : "dock-item"}
          onClick={() => props.onSelect(item.key)}
        >
          <span className="dock-icon"><item.icon size={18} /></span>
          <span>{item.label}</span>
          {item.key === "home" && !!props.attentionCount && <span className="dock-badge">{props.attentionCount}</span>}
        </button>
      ))}
    </nav>
  );
}

export function Sheet(props: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="sheet-layer">
      <button className="sheet-scrim" onClick={props.onClose} aria-label="Close" />
      <section className="sheet">
        <div className="sheet-grip" />
        <div className="sheet-top">
          <div>
            <h2>{props.title}</h2>
            {props.subtitle && <p>{props.subtitle}</p>}
          </div>
          <button className="sheet-x" onClick={props.onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </div>
        <div className="sheet-body">{props.children}</div>
        {props.footer && <div className="sheet-foot">{props.footer}</div>}
      </section>
    </div>
  );
}

/* ============ Toast ============ */

type ToastContextValue = { show: (message: string) => void };

const ToastContext = createContext<ToastContextValue>({ show: () => undefined });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(next);
    timerRef.current = setTimeout(() => setMessage(null), 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && <div className="toast" role="status">{message}</div>}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* Transitional exports keep the workflow components decoupled from visual
   naming. New work should use Button/Notice/Empty/Sheet directly. */
export const PrimaryButton = (props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  block?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) => {
  const { block, variant = "primary", className, ...rest } = props;
  const tone = variant === "primary" ? "ink" : variant === "danger" ? "bad" : "line";
  return <Button tone={tone} wide={block} className={className} {...rest} />;
};

export const Alert = (props: {
  variant: "success" | "warning" | "error" | "info";
  title?: string;
  message: string;
  onDismiss?: () => void;
}) => {
  const tone = props.variant === "success" ? "ok" : props.variant === "warning" ? "warn" : props.variant === "error" ? "bad" : "plain";
  return <Notice tone={tone} title={props.title} body={props.message} onDismiss={props.onDismiss} />;
};

export const EmptyState = Empty;
export const BottomSheet = Sheet;
export const Badge = (props: { status: string; label?: string }) => <StateTag state={props.status} label={props.label} />;
