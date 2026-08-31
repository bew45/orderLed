import React, { useEffect, useMemo, useState } from "react";
import { endpoints, modelPricePerMillion, parseLlmUsage, type AppSettings, type PdfStyle, type ProviderModel } from "../api";
import { useAppData } from "../state/AppData";
import { Button, IconCheck, IconEye, IconEyeOff, IconInfo, IconStar, IconStarOutline, Notice, Sheet, StateTag, Switch, Tag } from "./ui";

const PDF_STYLES: Array<{ id: PdfStyle; name: string; description: string }> = [
  { id: "midnight", name: "Midnight", description: "Full ledger, app split, restaurant summary" },
  { id: "minimal", name: "Minimal", description: "Clean order statement, hides item details" },
  { id: "audit", name: "Audit", description: "Full detail with a check-status column" }
];

function usd(value: number | null) {
  return value === null ? "Price unavailable" : `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)} / 1M`;
}

function promptPayError(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 13 ? "" : "Use a 10-digit mobile number or 13-digit national ID.";
}

export function SettingsSheet(props: { onClose: () => void }) {
  const { settings, saveSettings, screenshots } = useAppData();
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [search, setSearch] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setDraft(settings); }, [settings]);
  useEffect(() => {
    endpoints.getModels().then((data) => setModels(data.models)).catch(() => setModels([])).finally(() => setLoadingModels(false));
  }, []);

  const favoriteSet = useMemo(() => new Set(draft?.favorite_models ?? []), [draft]);
  const q = search.trim().toLowerCase();
  const matchingModels = models.filter((model) => !q || model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q));
  const selectedModel = models.find((model) => model.id === draft?.openrouter_model);
  const costs = screenshots.map((shot) => parseLlmUsage(shot.llm_usage_json));
  const totalCost = costs.reduce((sum, item) => sum + item.costUsd, 0);
  const totalTokens = costs.reduce((sum, item) => sum + item.totalTokens, 0);
  const hasUsage = costs.some((item) => item.totalTokens > 0 || item.costUsd > 0);

  if (!draft) return <Sheet title="Settings" onClose={props.onClose}><p className="screen-subtitle">Loading local configuration…</p></Sheet>;
  const keyReady = Boolean(draft.openrouter_api_key.trim());
  const payError = draft.promptpay_qr_enabled ? promptPayError(draft.promptpay_id) : "";
  const patch = (next: Partial<AppSettings>) => setDraft((current) => current ? { ...current, ...next } : current);
  const toggleFavorite = (id: string) => patch({ favorite_models: favoriteSet.has(id) ? draft.favorite_models.filter((value) => value !== id) : [...draft.favorite_models, id] });
  const preset = (value: "gpu" | "cpu" | "manual") => {
    if (value === "manual") patch({ ocr_amount_checker_enabled: false });
    else patch({ ocr_amount_checker_enabled: true, paddle_device: value, paddle_lang: "th" });
  };
  const save = async () => {
    if (payError) { setError(payError); return; }
    setSaving(true); setError("");
    try { await saveSettings(draft); props.onClose(); } catch (reason: any) { setError(reason.message || "Could not save settings"); } finally { setSaving(false); }
  };

  return <Sheet title="Settings" subtitle="Reader, verification, costs, and PDF output." onClose={props.onClose} footer={<><Button tone="line" onClick={props.onClose}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button></>}>
    <div className="settings-v2">
      {error && <Notice tone="bad" title="Settings not saved" body={error} onDismiss={() => setError("")} />}

      <section className="settings-status-card">
        <div><p className="overline">Reader health</p><strong>{keyReady ? "Ready to read screenshots" : "OpenRouter key needed"}</strong><small>{selectedModel?.name || draft.openrouter_model || "No vision model selected"}</small></div>
        <StateTag state={keyReady ? "ok" : "needs_check"} label={keyReady ? "Ready" : "Setup"} />
      </section>

      <SettingsSection eyebrow="AI reader" title="OpenRouter vision" description="Used to identify orders from screenshots.">
        <div className="field settings-key-field"><label>API key</label><input type={showKey ? "text" : "password"} value={draft.openrouter_api_key} placeholder="sk-or-…" onChange={(event) => patch({ openrouter_api_key: event.target.value })} /><button type="button" onClick={() => setShowKey((current) => !current)} aria-label="Show API key">{showKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}</button></div>
        <div className="setting-current-model"><span><small>Current model</small><strong>{selectedModel?.name || draft.openrouter_model}</strong></span>{selectedModel && <ModelPrices model={selectedModel} />}</div>
        <div className="field"><label>Model ID</label><input value={draft.openrouter_model} onChange={(event) => patch({ openrouter_model: event.target.value })} /></div>
      </SettingsSection>

      <SettingsSection eyebrow="Model library" title="Choose for quality or cost" description="Only image-capable OpenRouter models are listed.">
        <div className="model-toolbar"><span className="provider-chip">OpenRouter</span><input value={search} placeholder="Search a model" onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="model-list">{loadingModels ? <p className="screen-subtitle">Loading image models…</p> : matchingModels.length === 0 ? <p className="screen-subtitle">No image models found.</p> : matchingModels.slice(0, 120).map((model) => <ModelRow key={model.id} model={model} selected={draft.openrouter_model === model.id} favorite={favoriteSet.has(model.id)} onPick={() => patch({ openrouter_model: model.id })} onFavorite={() => toggleFavorite(model.id)} />)}</div>
      </SettingsSection>

      <SettingsSection eyebrow="Usage" title="Current import cost" description="Actual values returned by OpenRouter after reading each screenshot.">
        <div className="cost-grid"><div><small>Provider cost</small><strong>{hasUsage && totalCost > 0 ? `$${totalCost.toFixed(4)}` : "Not returned"}</strong></div><div><small>Tokens</small><strong>{hasUsage ? totalTokens.toLocaleString() : "—"}</strong></div><div><small>Screens read</small><strong>{screenshots.filter((shot) => shot.llm_status === "done").length}</strong></div></div>
        <div className="settings-hint"><IconInfo size={14} /><span>Cost appears only when the provider includes usage in its response; no estimate is presented as an actual charge.</span></div>
      </SettingsSection>

      <SettingsSection eyebrow="Verification" title="OCR amount checker" description="Compares visible amounts with the extracted order rows.">
        <div className="preset-row"><button className={draft.ocr_amount_checker_enabled && draft.paddle_device === "gpu" ? "preset on" : "preset"} onClick={() => preset("gpu")}><strong>Fast GPU</strong><small>Thai OCR · GPU</small></button><button className={draft.ocr_amount_checker_enabled && draft.paddle_device === "cpu" ? "preset on" : "preset"} onClick={() => preset("cpu")}><strong>Safe CPU</strong><small>Thai OCR · CPU</small></button><button className={!draft.ocr_amount_checker_enabled ? "preset on" : "preset"} onClick={() => preset("manual")}><strong>Manual</strong><small>No OCR check</small></button></div>
        <Switch checked={draft.ocr_amount_checker_enabled} onChange={(next) => patch({ ocr_amount_checker_enabled: next })} title="Use OCR amount checker" caption={draft.ocr_amount_checker_enabled ? `Running on ${draft.paddle_device.toUpperCase()}` : "Orders will be marked for manual checking."} />
        <div className="field-pair"><div className="field"><label>Language</label><input disabled={!draft.ocr_amount_checker_enabled} value={draft.paddle_lang} onChange={(event) => patch({ paddle_lang: event.target.value })} /></div><div className="field"><label>Timeout ms</label><input disabled={!draft.ocr_amount_checker_enabled} type="number" value={draft.paddle_timeout_ms} onChange={(event) => patch({ paddle_timeout_ms: Number(event.target.value) })} /></div></div>
      </SettingsSection>

      <SettingsSection eyebrow="PDF output" title="Statement style" description="Each style changes both the visual treatment and the included information.">
        <div className="pdf-style-grid">{PDF_STYLES.map((style) => <button key={style.id} className={draft.pdf_style === style.id ? "pdf-style-choice on" : "pdf-style-choice"} onClick={() => patch({ pdf_style: style.id })}><strong>{style.name}</strong><small>{style.description}</small>{draft.pdf_style === style.id && <Tag tone="inkfill">Default</Tag>}</button>)}</div>
      </SettingsSection>

      <SettingsSection eyebrow="Payment request" title="PromptPay QR" description="Included in a PDF only when enabled. The displayed net total remains unchanged.">
        <Switch checked={draft.promptpay_qr_enabled} onChange={(next) => patch({ promptpay_qr_enabled: next })} title="Include PromptPay QR" caption={draft.promptpay_qr_enabled ? "Shown under the statement total." : "PDFs do not include a QR code."} />
        <Switch checked={draft.promptpay_amount_locked} disabled={!draft.promptpay_qr_enabled} onChange={(next) => patch({ promptpay_amount_locked: next })} title="Lock QR amount" caption="Keep the statement’s net total as the QR amount." />
        <div className="field"><label>PromptPay ID</label><input disabled={!draft.promptpay_qr_enabled} value={draft.promptpay_id || ""} placeholder="0812345678 or national ID" onChange={(event) => patch({ promptpay_id: event.target.value })} /></div>
        {payError && <p className="field-error">{payError}</p>}
        <div className="field"><label>Recipient name</label><input disabled={!draft.promptpay_qr_enabled} value={draft.promptpay_recipient_name || ""} placeholder="Optional name on the statement" onChange={(event) => patch({ promptpay_recipient_name: event.target.value })} /></div>
      </SettingsSection>

      <button className="advanced-toggle" onClick={() => setAdvancedOpen((current) => !current)}><span>Advanced connection settings</span><span>{advancedOpen ? "Hide" : "Show"}</span></button>
      {advancedOpen && <div className="field"><label>OpenRouter base URL</label><input value={draft.openrouter_base_url} onChange={(event) => patch({ openrouter_base_url: event.target.value })} /></div>}
    </div>
  </Sheet>;
}

function SettingsSection(props: { eyebrow: string; title: string; description: string; children: React.ReactNode }) { return <section className="settings-v2-section"><div><p className="overline">{props.eyebrow}</p><h3>{props.title}</h3><p>{props.description}</p></div>{props.children}</section>; }

function ModelPrices({ model }: { model: ProviderModel }) { return <span className="model-price"><small>Input {usd(modelPricePerMillion(model.pricing?.prompt))}</small><small>Output {usd(modelPricePerMillion(model.pricing?.completion))}</small></span>; }

function ModelRow(props: { model: ProviderModel; selected: boolean; favorite: boolean; onPick: () => void; onFavorite: () => void }) { return <div className={props.selected ? "model-row selected" : "model-row"}><button className="model-main" onClick={props.onPick}><span className="model-check">{props.selected ? <IconCheck size={14} /> : ""}</span><span className="model-name">{props.model.name || props.model.id}</span><span className="model-meta">{props.model.context_length ? `${Math.round(props.model.context_length / 1000)}k ctx` : ""}</span><span className="model-id">{props.model.id}</span><span className="model-row-price">{usd(modelPricePerMillion(props.model.pricing?.prompt))} input · {usd(modelPricePerMillion(props.model.pricing?.completion))} output</span></button><button className={props.favorite ? "model-star on" : "model-star"} onClick={props.onFavorite} aria-label="Favorite model">{props.favorite ? <IconStar size={16} /> : <IconStarOutline size={16} />}</button></div>; }
