import React, { useState } from "react";
import { AppDataProvider, useAppData } from "./state/AppData";
import { HomeScreen } from "./screens/HomeScreen";
import { ImportScreen } from "./screens/ImportScreen";
import { BatchesScreen } from "./screens/BatchesScreen";
import { ExportScreen } from "./screens/ExportScreen";
import { UploadFlow } from "./screens/UploadFlow";
import { SettingsSheet } from "./components/SettingsSheet";
import { CreateBatchSheet } from "./components/CreateBatchSheet";
import { Dock, IconGear, Notice, ToastProvider, type TabKey } from "./components/ui";

function Shell() {
  const { allOrders, error, clearError, loading } = useAppData();
  const [tab, setTab] = useState<TabKey>("import");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createBatchOpen, setCreateBatchOpen] = useState(false);

  if (loading) {
    return (
      <div className="shell">
        <div className="shell-topbar">
          <span className="wordmark"><i />OrderLedger</span>
        </div>
        <div className="shell-scroll">
          <div className="screen">
            <div className="screen-head">
              <p>Loading your ledger…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Bug B10: the tab badge counts only blocked rows (money-affecting, need a human),
  // not every "review" row — those still show in totals and just carry a chip.
  const needsCheckCount = allOrders.filter((order) => order.review_tier === "blocked").length;

  return (
    <div className="shell">
      <div className="shell-topbar">
        <span className="wordmark"><i />OrderLedger</span>
        <button className="icon-orb" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <IconGear size={17} />
        </button>
      </div>

      <div className="shell-scroll">
        {error && (
          <div style={{ padding: "0.25rem var(--pad-x) 0" }}>
            <Notice tone="bad" title="Something went wrong" body={error} onDismiss={clearError} />
          </div>
        )}

        {tab === "import" && (
          <ImportScreen
            onUpload={() => setUploadOpen(true)}
            onCreateBatch={() => setCreateBatchOpen(true)}
            onOpenDashboard={() => setTab("home")}
          />
        )}
        {tab === "home" && (
          <HomeScreen
            onCreateBatch={() => setCreateBatchOpen(true)}
            onOpenImport={() => setTab("import")}
            onOpenExport={() => setTab("export")}
          />
        )}
        {tab === "batches" && (
          <BatchesScreen onCreateBatch={() => setCreateBatchOpen(true)} onSelected={() => setTab("import")} />
        )}
        {tab === "export" && <ExportScreen />}
      </div>

      <Dock active={tab} attentionCount={needsCheckCount} onSelect={setTab} />

      {uploadOpen && (
        <UploadFlow
          onClose={() => setUploadOpen(false)}
          onDone={() => { setUploadOpen(false); setTab("import"); }}
        />
      )}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {createBatchOpen && (
        <CreateBatchSheet onClose={() => setCreateBatchOpen(false)} onCreated={() => setTab("import")} />
      )}
    </div>
  );
}

export function App() {
  return (
    <AppDataProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </AppDataProvider>
  );
}
