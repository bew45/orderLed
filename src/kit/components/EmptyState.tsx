import React from "react";
import { IconImageStack, IconInbox, IconCpu } from "./Icons";

export type EmptyStateKind = "no_screenshots" | "no_orders" | "no_models" | "custom";

export interface EmptyStateProps {
  kind: EmptyStateKind;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

const PRESETS: Record<Exclude<EmptyStateKind, "custom">, { icon: React.ReactNode; title: string; description: string; actionLabel: string }> = {
  no_screenshots: {
    icon: <IconImageStack width={24} height={24} />,
    title: "No screenshots yet",
    description: "Upload order screenshots from Grab, LINE MAN, or ShopeeFood to start building your ledger.",
    actionLabel: "Upload screenshots",
  },
  no_orders: {
    icon: <IconInbox width={24} height={24} />,
    title: "No orders found",
    description: "Once screenshots finish processing, extracted order rows will show up here for review.",
    actionLabel: "Upload screenshots",
  },
  no_models: {
    icon: <IconCpu width={24} height={24} />,
    title: "No models available",
    description: "Connect a provider in Settings to choose which model reads your screenshots.",
    actionLabel: "Open settings",
  },
};

/**
 * Polished empty state for no screenshots / no orders / no models,
 * or fully custom via kind="custom".
 */
export function EmptyState({ kind, title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  const preset = kind !== "custom" ? PRESETS[kind] : undefined;

  return (
    <div className="ol-empty">
      <div className="ol-empty__icon">{icon ?? preset?.icon}</div>
      <p className="ol-empty__title">{title ?? preset?.title}</p>
      <p className="ol-empty__desc">{description ?? preset?.description}</p>
      {(onAction || preset?.actionLabel) && (
        <button type="button" className="ol-btn ol-btn--primary ol-empty__action" onClick={onAction}>
          {actionLabel ?? preset?.actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;

/* ---------------------------------------------------------------------------
 * Example usage:
 *
 * <EmptyState kind="no_screenshots" onAction={() => console.log("open picker (mock)")} />
 * <EmptyState kind="no_orders" />
 * <EmptyState kind="no_models" actionLabel="Add provider" onAction={() => {}} />
 * ------------------------------------------------------------------------- */
