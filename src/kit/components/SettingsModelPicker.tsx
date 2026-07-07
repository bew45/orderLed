import React, { useMemo, useState } from "react";
import { IconSearch } from "./Icons";
import { ModelPickerRow } from "./ModelPickerRow";
import { EmptyState } from "./EmptyState";
import { ModelInfo } from "./types";

export interface ProviderOption {
  id: string;
  label: string;
  color: string;
}

export interface SettingsModelPickerProps {
  providers: ProviderOption[];
  models: ModelInfo[];
  selectedModelId: string;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

/**
 * Model picker: provider filter chips, a search input, a Favorites
 * section, and an All models section. Selection is shown with a
 * checkmark; favoriting is a star toggle handled by ModelPickerRow.
 */
export function SettingsModelPicker({
  providers,
  models,
  selectedModelId,
  onSelect,
  onToggleFavorite,
}: SettingsModelPickerProps) {
  const [query, setQuery] = useState("");
  const [activeProvider, setActiveProvider] = useState<string>("all");

  const providerColor = (name: string) =>
    providers.find((p) => p.label === name)?.color ?? "var(--ol-brand)";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      const matchesProvider = activeProvider === "all" || m.provider === activeProvider;
      const matchesQuery =
        !q || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
      return matchesProvider && matchesQuery;
    });
  }, [models, query, activeProvider]);

  const favorites = filtered.filter((m) => m.isFavorite);

  return (
    <div className="ol-model-picker">
      <div className="ol-model-picker__search">
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="ol-provider-chip"
            style={{
              background: activeProvider === "all" ? "var(--ol-ink)" : "var(--ol-paper-sunken)",
              color: activeProvider === "all" ? "var(--ol-ink-on-brand)" : "var(--ol-ink-soft)",
            }}
            onClick={() => setActiveProvider("all")}
          >
            All providers
          </button>
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ol-provider-chip"
              style={{
                background: activeProvider === p.label ? "var(--ol-ink)" : "var(--ol-paper-sunken)",
                color: activeProvider === p.label ? "var(--ol-ink-on-brand)" : "var(--ol-ink-soft)",
              }}
              onClick={() => setActiveProvider(p.label)}
            >
              <span className="ol-provider-chip__dot" style={{ background: p.color }} />
              {p.label}
            </button>
          ))}
        </div>

        <div className="ol-model-picker__search-input">
          <IconSearch width={16} height={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState kind="no_models" />
      ) : (
        <>
          {favorites.length > 0 && (
            <div className="ol-model-picker__section">
              <p className="ol-model-picker__section-title">Favorites</p>
              <div className="ol-model-picker__list">
                {favorites.map((m) => (
                  <ModelPickerRow
                    key={m.id}
                    model={m}
                    selected={m.id === selectedModelId}
                    onSelect={onSelect}
                    onToggleFavorite={onToggleFavorite}
                    avatarColor={providerColor(m.provider)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="ol-model-picker__section">
            <p className="ol-model-picker__section-title">All models</p>
            <div className="ol-model-picker__list">
              {filtered.map((m) => (
                <ModelPickerRow
                  key={m.id}
                  model={m}
                  selected={m.id === selectedModelId}
                  onSelect={onSelect}
                  onToggleFavorite={onToggleFavorite}
                  avatarColor={providerColor(m.provider)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default SettingsModelPicker;

/* ---------------------------------------------------------------------------
 * Example usage:
 *
 * const providers = [
 *   { id: "anthropic", label: "Anthropic", color: "#a3701c" },
 *   { id: "openai", label: "OpenAI", color: "#2b4f8c" },
 *   { id: "google", label: "Google", color: "#2f6d4f" },
 * ];
 * const [models, setModels] = useState(mockModels);
 * const [selected, setSelected] = useState(mockModels[0].id);
 *
 * <SettingsModelPicker
 *   providers={providers}
 *   models={models}
 *   selectedModelId={selected}
 *   onSelect={setSelected}
 *   onToggleFavorite={(id) =>
 *     setModels((prev) => prev.map((m) => (m.id === id ? { ...m, isFavorite: !m.isFavorite } : m)))
 *   }
 * />
 * ------------------------------------------------------------------------- */
