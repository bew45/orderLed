import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { endpoints, monthNow, type AppSettings, type BatchListItem, type BatchSummary, type OrderRow, type UploadResult } from "../api";

type AppDataValue = {
  batches: BatchListItem[];
  activeBatchId: string;
  activeBatch: BatchListItem | undefined;
  orders: OrderRow[];
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
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshBatches = useCallback(async () => {
    const data = await endpoints.listBatches();
    setBatches(data.batches);
    return data.batches;
  }, []);

  const refreshOrders = useCallback(async (batchId?: string) => {
    const id = batchId ?? activeBatchId;
    if (!id) {
      setOrders([]);
      setSummary(null);
      return;
    }
    const data = await endpoints.listOrders(id);
    setOrders(data.orders);
    setSummary(data.summary);
  }, [activeBatchId]);

  const refreshSettings = useCallback(async () => {
    const data = await endpoints.getSettings();
    setSettings(data.settings);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [loadedBatches] = await Promise.all([refreshBatches(), refreshSettings()]);
        if (loadedBatches[0]) setActiveBatchId(loadedBatches[0].id);
      } catch (err: any) {
        setError(err.message || "Failed to load OrderLedger data");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeBatchId) {
      setOrders([]);
      setSummary(null);
      return;
    }
    refreshOrders(activeBatchId).catch((err) => setError(err.message));
  }, [activeBatchId, refreshOrders]);

  const value = useMemo<AppDataValue>(() => ({
    batches,
    activeBatchId,
    activeBatch: batches.find((batch) => batch.id === activeBatchId),
    orders,
    summary,
    settings,
    loading,
    error,
    clearError: () => setError(""),
    selectBatch: (id: string) => setActiveBatchId(id),

    refreshBatches: async () => { await refreshBatches(); },
    refreshOrders: async () => { await refreshOrders(); },

    createBatch: async (input) => {
      const data = await endpoints.createBatch({
        title: input.title || `Food orders ${monthNow()}`,
        month: input.month || monthNow()
      });
      await refreshBatches();
      setActiveBatchId(data.batch.id);
      return data.batch;
    },

    deleteBatch: async (id: string) => {
      await endpoints.deleteBatch(id);
      const next = await refreshBatches();
      if (activeBatchId === id) setActiveBatchId(next[0]?.id ?? "");
    },

    uploadFiles: async (files) => {
      if (!activeBatchId) throw new Error("No active batch selected");
      const result = await endpoints.uploadScreenshots(activeBatchId, files);
      await refreshBatches();
      await refreshOrders(activeBatchId);
      return result;
    },

    processActiveBatch: async (force = false) => {
      if (!activeBatchId) throw new Error("No active batch selected");
      const data = await endpoints.processBatch(activeBatchId, force);
      await refreshBatches();
      await refreshOrders(activeBatchId);
      return data.summary;
    },

    updateOrder: async (id, patch) => {
      const data = await endpoints.updateOrder(id, patch);
      setOrders((current) => current.map((order) => (order.id === id ? data.order : order)));
      await Promise.all([refreshBatches(), refreshOrders(activeBatchId)]);
      return data.order;
    },

    deleteOrder: async (id) => {
      await endpoints.deleteOrder(id);
      setOrders((current) => current.filter((order) => order.id !== id));
      await Promise.all([refreshBatches(), refreshOrders(activeBatchId)]);
    },

    refreshSettings: async () => { await refreshSettings(); },

    saveSettings: async (patch) => {
      const data = await endpoints.saveSettings(patch);
      setSettings(data.settings);
      return data.settings;
    }
  }), [batches, activeBatchId, orders, summary, settings, loading, error, refreshBatches, refreshOrders, refreshSettings]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
