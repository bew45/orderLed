import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { endpoints, monthNow, type AppSettings, type BatchListItem, type BatchSummary, type OrderRow, type ScreenshotRow, type UploadResult } from "../api";

const AUTO_SYNC_INTERVAL_MS = 5000;

type AppDataValue = {
  batches: BatchListItem[];
  activeBatchId: string;
  activeBatch: BatchListItem | undefined;
  orders: OrderRow[];
  screenshots: ScreenshotRow[];
  summary: BatchSummary | null;
  settings: AppSettings | null;
  loading: boolean;
  error: string;
  clearError: () => void;
  selectBatch: (id: string) => void;
  refreshBatches: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  createBatch: (input: { title: string; month: string }) => Promise<BatchListItem>;
  deleteBatch: (id: string) => Promise<void>;
  uploadFiles: (files: FileList | File[]) => Promise<UploadResult>;
  processActiveBatch: (force?: boolean) => Promise<BatchSummary>;
  updateOrder: (id: string, patch: Partial<OrderRow>) => Promise<OrderRow>;
  deleteOrder: (id: string) => Promise<void>;
  refreshSettings: () => Promise<void>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
};

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotRow[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const activeBatchIdRef = useRef(activeBatchId);
  const syncInFlightRef = useRef(false);
  const didInitialLoadRef = useRef(false);

  useEffect(() => {
    activeBatchIdRef.current = activeBatchId;
  }, [activeBatchId]);

  const refreshBatches = useCallback(async () => {
    const data = await endpoints.listBatches();
    setBatches(data.batches);
    return data.batches;
  }, []);

  const refreshOrders = useCallback(async (batchId?: string) => {
    const id = batchId ?? activeBatchId;
    if (!id) {
      setOrders([]);
      setScreenshots([]);
      setSummary(null);
      return;
    }
    const [orderData, screenshotData] = await Promise.all([
      endpoints.listOrders(id),
      endpoints.listScreenshots(id)
    ]);
    setOrders(orderData.orders);
    setScreenshots(screenshotData.screenshots);
    setSummary(orderData.summary);
  }, [activeBatchId]);

  const refreshSettings = useCallback(async () => {
    const data = await endpoints.getSettings();
    setSettings(data.settings);
  }, []);

  const syncActiveData = useCallback(async (reason = "manual") => {
    if (syncInFlightRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    syncInFlightRef.current = true;
    try {
      const data = await endpoints.listBatches();
      setBatches(data.batches);

      const currentActiveId = activeBatchIdRef.current;
      const nextActiveId = currentActiveId && data.batches.some((batch) => batch.id === currentActiveId)
        ? currentActiveId
        : data.batches[0]?.id ?? "";

      if (nextActiveId !== currentActiveId) {
        activeBatchIdRef.current = nextActiveId;
        setActiveBatchId(nextActiveId);
      }

      if (nextActiveId) {
        const [orderData, screenshotData] = await Promise.all([
          endpoints.listOrders(nextActiveId),
          endpoints.listScreenshots(nextActiveId)
        ]);
        setOrders(orderData.orders);
        setScreenshots(screenshotData.screenshots);
        setSummary(orderData.summary);
      } else {
        setOrders([]);
        setScreenshots([]);
        setSummary(null);
      }
    } catch (err: any) {
      console.warn("[OrderLedgerSync]", { reason, error: err?.message || err });
      if (!didInitialLoadRef.current) setError(err.message || "Failed to load OrderLedger data");
    } finally {
      didInitialLoadRef.current = true;
      syncInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([syncActiveData("initial"), refreshSettings()]);
      } catch (err: any) {
        setError(err.message || "Failed to load OrderLedger data");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSettings, syncActiveData]);

  useEffect(() => {
    if (!activeBatchId) {
      setOrders([]);
      setScreenshots([]);
      setSummary(null);
      return;
    }
    refreshOrders(activeBatchId).catch((err) => setError(err.message));
  }, [activeBatchId, refreshOrders]);

  useEffect(() => {
    if (loading) return;

    const tick = () => {
      void syncActiveData("interval");
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncActiveData("visibility");
    };
    const onResume = () => {
      void syncActiveData("resume");
    };

    const interval = window.setInterval(tick, AUTO_SYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("online", onResume);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("online", onResume);
    };
  }, [loading, syncActiveData]);

  const value: AppDataValue = {
    batches,
    activeBatchId,
    activeBatch: batches.find((batch) => batch.id === activeBatchId),
    orders,
    screenshots,
    summary,
    settings,
    loading,
    error,
    clearError: () => setError(""),
    selectBatch: (id: string) => setActiveBatchId(id),

    refreshBatches: async () => { await syncActiveData("refresh-batches"); },
    refreshOrders: async () => { await syncActiveData("refresh-orders"); },

    createBatch: async (input) => {
      const data = await endpoints.createBatch({
        title: input.title || `Food order import ${monthNow()}`,
        month: input.month || monthNow()
      });
      await syncActiveData("create-import");
      setActiveBatchId(data.batch.id);
      activeBatchIdRef.current = data.batch.id;
      return data.batch;
    },

    deleteBatch: async (id: string) => {
      await endpoints.deleteBatch(id);
      await syncActiveData("delete-import");
    },

    uploadFiles: async (files) => {
      if (!activeBatchId) throw new Error("No active import selected");
      const result = await endpoints.uploadScreenshots(activeBatchId, files);
      await syncActiveData("upload");
      return result;
    },

    processActiveBatch: async (force = false) => {
      if (!activeBatchId) throw new Error("No active import selected");
      const data = await endpoints.processBatch(activeBatchId, force);
      await syncActiveData("process");
      return data.summary;
    },

    updateOrder: async (id, patch) => {
      const data = await endpoints.updateOrder(id, patch);
      setOrders((current) => current.map((order) => (order.id === id ? data.order : order)));
      await syncActiveData("update-order");
      return data.order;
    },

    deleteOrder: async (id) => {
      await endpoints.deleteOrder(id);
      setOrders((current) => current.filter((order) => order.id !== id));
      await syncActiveData("delete-order");
    },

    refreshSettings: async () => { await refreshSettings(); },

    saveSettings: async (patch) => {
      const data = await endpoints.saveSettings(patch);
      setSettings(data.settings);
      return data.settings;
    }
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
