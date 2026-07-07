import React from "react";
import { IconStar, IconCheck } from "./Icons";
import { ModelInfo } from "./types";

export interface ModelPickerRowProps {
  model: ModelInfo;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  avatarColor?: string;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * Single selectable model row used inside SettingsModelPicker.
 * Also usable standalone in any list of models.
 */
export function ModelPickerRow({
  model,
  selected,
  onSelect,
  onToggleFavorite,
  avatarColor = "var(--ol-brand)",
}: ModelPickerRowProps) {
  return (
    <button type="button" className="ol-model-row" onClick={() => onSelect(model.id)}>
      <span className="ol-model-row__avatar" style={{ background: avatarColor }}>
        {initials(model.name)}
      </span>
      <span className="ol-model-row__body">
        <span className="ol-model-row__name">{model.name}</span>
        <span className="ol-model-row__meta">{model.description}</span>
      </span>
      <span className="ol-model-row__actions">
        <button
          type="button"
          className={`ol-model-row__star ${model.isFavorite ? "ol-model-row__star--active" : ""}`}
          aria-label={model.isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(model.id);
          }}
        >
          <IconStar width={16} height={16} filled={model.isFavorite} />
        </button>
        {selected && (
          <span className="ol-model-row__check" style={{ background: "var(--ol-brand)", color: "var(--ol-ink-on-brand)" }}>
            <IconCheck width={13} height={13} />
          </span>
        )}
      </span>
    </button>
  );
}

export default ModelPickerRow;

/* ---------------------------------------------------------------------------
 * Example usage:
 *
 * <ModelPickerRow
 *   model={mockModels[0]}
 *   selected={selectedId === mockModels[0].id}
 *   onSelect={setSelectedId}
 *   onToggleFavorite={toggleFavorite}
 * />
 * ------------------------------------------------------------------------- */
