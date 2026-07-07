import React, { useState } from "react";
import { AppDataProvider, useAppData } from "./state/AppData";
import { HomeScreen } from "./screens/HomeScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { BatchesScreen } from "./screens/BatchesScreen";
import { ExportScreen } from "./screens/ExportScreen";
import { UploadFlow } from "./screens/UploadFlow";
import { SettingsSheet } from "./components/SettingsSheet";
import { CreateBatchSheet } from "./components/CreateBatchSheet";
import { IconGear, TabBar, type TabKey } from "./components/ui";
import { EmptyState } from "./kit/components/EmptyState";

function Shell() {
  const { summary, error, clearError, loading } = useAppData();
  const [tab, setTab] = useState<TabKey>("home");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createBatchOpen, setCreateBatchOpen] = useState(false);

  if (loading) {
    return (
      <div className="app-shell ol-root">
        <div className="screen">
          <EmptyState kind="custom" title="Loading OrderLedger" description="Preparing your ledger..." />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell ol-root">
      <header className="app-header">
        <div>
          <p className="ol-eyebrow">OrderLedger</p>
          <h1>Food order ledger</h1>
        </div>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <IconGear size={19} />
        </button>
      </header>

      {error && (
        <div className="inline-banner-slot">
          <button className="banner banner-danger" onClick={clearError}>{error}</button>
        </div>
      )}

      {tab === "home" && (
        <HomeScreen
          onUpload={() => setUploadOpen(true)}
          onReview={() => setTab("review")}
          onCreateBatch={() => setCreateBatchOpen(true)}
        />
      )}
      {tab === "review" && <ReviewScreen />}
      {tab === "batches" && (
        <BatchesScreen onCreateBatch={() => setCreateBatchOpen(true)} onSelected={() => setTab("home")} />
      )}
      {tab === "export" && <ExportScreen />}

      <TabBar active={tab} reviewBadge={summary?.ordersNeedingReview ?? 0} onSelect={setTab} />

      {uploadOpen && (
        <UploadFlow
          onClose={() => setUploadOpen(false)}
          onReviewNow={() => { setUploadOpen(false); setTab("review"); }}
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
