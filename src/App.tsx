import React, { useState } from "react";
import { AppDataProvider, useAppData } from "./state/AppData";
import { HomeScreen } from "./screens/HomeScreen";
import { BatchesScreen } from "./screens/BatchesScreen";
import { ExportScreen } from "./screens/ExportScreen";
import { UploadFlow } from "./screens/UploadFlow";
import { SettingsSheet } from "./components/SettingsSheet";
import { CreateBatchSheet } from "./components/CreateBatchSheet";
import { Alert, IconGear, TabBar, type TabKey } from "./components/ui";

function Shell() {
  const { summary, error, clearError, loading } = useAppData();
  const [tab, setTab] = useState<TabKey>("home");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createBatchOpen, setCreateBatchOpen] = useState(false);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="screen">
          <p className="screen-subtitle">Loading OrderLedger…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">OrderLedger</p>
          <h1>Food order ledger</h1>
        </div>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <IconGear size={19} />
        </button>
      </header>

      {error && (
        <div className="inline-banner-slot">
          <Alert variant="error" title="Something went wrong" message={error} onDismiss={clearError} />
        </div>
      )}

      {tab === "home" && (
        <HomeScreen
          onUpload={() => setUploadOpen(true)}
          onCreateBatch={() => setCreateBatchOpen(true)}
        />
      )}
      {tab === "batches" && (
        <BatchesScreen onCreateBatch={() => setCreateBatchOpen(true)} />
      )}
      {tab === "export" && <ExportScreen />}

      <TabBar active={tab} attentionCount={summary?.ordersNeedingReview ?? 0} onSelect={setTab} />

      {uploadOpen && (
        <UploadFlow
          onClose={() => setUploadOpen(false)}
          onDone={() => { setUploadOpen(false); setTab("home"); }}
        />
      )}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {createBatchOpen && (
        <CreateBatchSheet onClose={() => setCreateBatchOpen(false)} onCreated={() => setTab("home")} />
      )}
    </div>
  );
}

export function App() {
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  );
}
