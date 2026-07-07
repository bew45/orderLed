import React, { useEffect, useMemo, useState } from "react";
import { endpoints, type AppSettings, type ProviderModel } from "../api";
import { InlineAlert } from "../kit/components/InlineAlert";
import { SettingsModelPicker } from "../kit/components/SettingsModelPicker";
import { toModelInfo } from "../kitAdapter";
import { useAppData } from "../state/AppData";
import { BottomSheet, IconEye, IconEyeOff, PrimaryButton } from "./ui";

export function SettingsSheet(props: { onClose: () => void }) {
  const { settings, saveSettings } = useAppData();
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
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

  const kitModels = useMemo(
    () => models.map((model) => toModelInfo(model, draft?.favorite_models ?? [])).slice(0, 160),
    [models, draft?.favorite_models]
  );

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
    const favoriteModels = draft.favorite_models ?? [];
    const next = favoriteModels.includes(modelId)
      ? favoriteModels.filter((id) => id !== modelId)
      : [...favoriteModels, modelId];
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
      subtitle="OpenRouter is the recommended accurate path for iPhone screenshots."
      onClose={props.onClose}
      footer={
        <>
          <PrimaryButton variant="ghost" onClick={props.onClose}>Cancel</PrimaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>Save settings</PrimaryButton>
        </>
      }
    >
      <div className="stack">
        {error && <InlineAlert variant="error" message={error} />}
        {note && <InlineAlert variant="success" message={note} />}

        <div className="field input-icon-btn">
          <label>OpenRouter API key</label>
          <input
            type={showKey ? "text" : "password"}
            value={draft.openrouter_api_key}
            placeholder="sk-or-..."
            onChange={(event) => patch({ openrouter_api_key: event.target.value })}
          />
          <button type="button" onClick={() => setShowKey((value) => !value)} aria-label="Toggle key visibility">
            {showKey ? <IconEyeOff size={17} /> : <IconEye size={17} />}
          </button>
        </div>

        <div className="field">
          <label>Selected model</label>
          <input value={draft.openrouter_model} onChange={(event) => patch({ openrouter_model: event.target.value })} />
        </div>

        <section className="settings-section">
          <div className="card-title-row">
            <h2>Model picker</h2>
            <span>{loadingModels ? "loading..." : `${models.length} models`}</span>
          </div>

          {loadingModels && <InlineAlert variant="info" message="Loading OpenRouter model list..." />}
          {!loadingModels && kitModels.length === 0 && (
            <InlineAlert variant="warning" message="No models loaded. You can still type a model id above." />
          )}
          {kitModels.length > 0 && (
            <SettingsModelPicker
              providers={[{ id: "openrouter", label: "OpenRouter", color: "var(--ol-brand)" }]}
              models={kitModels}
              selectedModelId={draft.openrouter_model}
              onSelect={(id) => patch({ openrouter_model: id })}
              onToggleFavorite={toggleFavorite}
            />
          )}
        </section>

        <button className="advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}>
          <span>Advanced: base URL and local OCR (optional)</span>
          <span>{advancedOpen ? "Hide" : "Show"}</span>
        </button>

        {advancedOpen && (
          <div className="advanced-body stack">
            <div className="field">
              <label>OpenRouter base URL</label>
              <input value={draft.openrouter_base_url} onChange={(event) => patch({ openrouter_base_url: event.target.value })} />
            </div>
            <div className="field">
              <label>Local OCR python path</label>
              <input
                value={draft.paddle_python}
                placeholder=".venv-ocr\\Scripts\\python.exe"
                onChange={(event) => patch({ paddle_python: event.target.value })}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label>OCR language</label>
                <input value={draft.paddle_lang} onChange={(event) => patch({ paddle_lang: event.target.value })} />
              </div>
              <div className="field">
                <label>Timeout (ms)</label>
                <input
                  type="number"
                  value={draft.paddle_timeout_ms}
                  onChange={(event) => patch({ paddle_timeout_ms: Number(event.target.value) })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
