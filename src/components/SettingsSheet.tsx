import React, { useEffect, useMemo, useState } from "react";
import { endpoints, type AppSettings, type ProviderModel } from "../api";
import { useAppData } from "../state/AppData";
import { Alert, BottomSheet, IconCheck, IconEye, IconEyeOff, IconStar, IconStarOutline, PrimaryButton } from "./ui";

export function SettingsSheet(props: { onClose: () => void }) {
  const { settings, saveSettings } = useAppData();
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [search, setSearch] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    setLoadingModels(true);
    endpoints.getModels()
      .then((data) => setModels(data.models))
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, []);

  const favoriteSet = useMemo(() => new Set(draft?.favorite_models ?? []), [draft]);
  const q = search.trim().toLowerCase();
  const matches = (model: { id: string; name: string }) =>
    !q || model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q);

  const favoriteModels = (draft?.favorite_models ?? [])
    .map((id) => models.find((model) => model.id === id) ?? { id, name: id, context_length: 0 })
    .filter(matches);
  const visibleModels = models.filter(matches);
  const selectedModel = draft ? models.find((model) => model.id === draft.openrouter_model) : null;
  const keyReady = Boolean(draft?.openrouter_api_key.trim());

  if (!draft) {
    return (
      <BottomSheet title="Extraction setup" onClose={props.onClose}>
        <p className="screen-subtitle">Loading settings...</p>
      </BottomSheet>
    );
  }

  function patch(next: Partial<AppSettings>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  function toggleFavorite(modelId: string) {
    if (!draft) return;
    const next = favoriteSet.has(modelId)
      ? draft.favorite_models.filter((id) => id !== modelId)
      : [...draft.favorite_models, modelId];
    patch({ favorite_models: next });
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setNote("");
    try {
      await saveSettings(draft);
      setNote("Saved");
      props.onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      title="Extraction setup"
      subtitle="Tune the vision model and optional local OCR fallback."
      onClose={props.onClose}
      footer={
        <>
          <PrimaryButton variant="ghost" onClick={props.onClose}>Cancel</PrimaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>Save settings</PrimaryButton>
        </>
      }
    >
      <div className="stack settings-stack">
        {error && <Alert variant="error" message={error} />}
        {note && <Alert variant="success" message={note} />}

        <section className={keyReady ? "settings-hero-card is-ready" : "settings-hero-card"}>
          <span className="settings-status-pill">
            <span className="settings-status-dot" />
            {keyReady ? "Vision extraction ready" : "API key needed"}
          </span>
          <strong>{selectedModel?.name || draft.openrouter_model || "No model selected"}</strong>
          <p>OpenRouter vision is the accurate path for Grab, LINE MAN, and ShopeeFood screenshots. Local OCR can help as a fallback.</p>
        </section>

        <section className="settings-section-card">
          <div className="settings-section-head">
            <div>
              <h3>OpenRouter vision</h3>
              <p>Used when reading screenshots and extracting order rows.</p>
            </div>
          </div>

          <div className="field input-icon-btn">
            <label>API key</label>
            <input
              type={showKey ? "text" : "password"}
              value={draft.openrouter_api_key}
              placeholder="sk-or-..."
              onChange={(e) => patch({ openrouter_api_key: e.target.value })}
            />
            <button type="button" onClick={() => setShowKey((v) => !v)} aria-label="Toggle key visibility">
              {showKey ? <IconEyeOff size={17} /> : <IconEye size={17} />}
            </button>
          </div>

          <div className="field">
            <label>Selected model</label>
            <input value={draft.openrouter_model} onChange={(e) => patch({ openrouter_model: e.target.value })} />
          </div>
        </section>

        <section className="settings-section-card">
          <div className="settings-section-head">
            <div>
              <h3>Model library</h3>
              <p>Vision-capable models only. Pick one and star favorites for quick reuse.</p>
            </div>
            <span>{loadingModels ? "loading" : `${models.length} models`}</span>
          </div>

          <div className="model-toolbar">
            <button className="provider-chip">OpenRouter</button>
            <input value={search} placeholder="Search models" onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="model-list">
            {favoriteModels.length > 0 && <div className="model-section">Favorites</div>}
            {favoriteModels.map((model) => (
              <ModelRow
                key={`fav-${model.id}`}
                model={model}
                selected={draft.openrouter_model === model.id}
                favorite
                onPick={() => patch({ openrouter_model: model.id })}
                onFavorite={() => toggleFavorite(model.id)}
              />
            ))}
            <div className="model-section">All models</div>
            {loadingModels ? (
              <div className="screen-subtitle">Loading models...</div>
            ) : visibleModels.length === 0 ? (
              <div className="screen-subtitle">No models loaded. You can still type a model id above.</div>
            ) : (
              visibleModels.slice(0, 140).map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  selected={draft.openrouter_model === model.id}
                  favorite={favoriteSet.has(model.id)}
                  onPick={() => patch({ openrouter_model: model.id })}
                  onFavorite={() => toggleFavorite(model.id)}
                />
              ))
            )}
          </div>
        </section>

        <section className="settings-section-card">
          <div className="settings-section-head">
            <div>
              <h3>Local OCR fallback</h3>
              <p>Optional PaddleOCR setup. Vision extraction can still run without it.</p>
            </div>
          </div>

          <div className="field">
            <label>Python path</label>
            <input
              value={draft.paddle_python}
              placeholder=".venv-ocr\\Scripts\\python.exe"
              onChange={(e) => patch({ paddle_python: e.target.value })}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>OCR language</label>
              <input value={draft.paddle_lang} onChange={(e) => patch({ paddle_lang: e.target.value })} />
            </div>
            <div className="field">
              <label>Timeout (ms)</label>
              <input
                type="number"
                value={draft.paddle_timeout_ms}
                onChange={(e) => patch({ paddle_timeout_ms: Number(e.target.value) })}
              />
            </div>
          </div>
        </section>

        <button className="advanced-toggle" onClick={() => setAdvancedOpen((v) => !v)}>
          <span>Advanced network settings</span>
          <span>{advancedOpen ? "Hide" : "Show"}</span>
        </button>

        {advancedOpen && (
          <section className="settings-section-card">
            <div className="field">
              <label>OpenRouter base URL</label>
              <input value={draft.openrouter_base_url} onChange={(e) => patch({ openrouter_base_url: e.target.value })} />
            </div>
          </section>
        )}
      </div>
    </BottomSheet>
  );
}

function ModelRow(props: {
  model: { id: string; name: string; context_length: number };
  selected: boolean;
  favorite: boolean;
  onPick: () => void;
  onFavorite: () => void;
}) {
  return (
    <div className={props.selected ? "model-row selected" : "model-row"}>
      <button className="model-main" onClick={props.onPick}>
        <span className="model-check">{props.selected ? <IconCheck size={14} /> : ""}</span>
        <span className="model-name">{props.model.name || props.model.id}</span>
        <span className="model-id">{props.model.id}</span>
        {props.model.context_length ? <span className="model-meta">{props.model.context_length.toLocaleString()} ctx</span> : null}
      </button>
      <button className={props.favorite ? "model-star on" : "model-star"} onClick={props.onFavorite} aria-label="Favorite model">
        {props.favorite ? <IconStar size={16} /> : <IconStarOutline size={16} />}
      </button>
    </div>
  );
}
