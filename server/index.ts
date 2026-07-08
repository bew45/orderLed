console.log(`[boot] server/index.ts starting, pid=${process.pid}`);
import "dotenv/config";
console.log("[boot] dotenv loaded");
import cors from "cors";
import express from "express";
import multer from "multer";
console.log("[boot] express/cors/multer loaded");
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { uuid } from "./db";
console.log("[boot] db loaded (sqlite opened)");
import { writeScreenshotImage, readStoredImage } from "./image-store";
import { guessSourceAppFromText } from "./normalize";
console.log("[boot] image-store/normalize loaded");
import { processBatch, stopAllProcessing } from "./extraction/process";
console.log("[boot] extraction/process loaded");
import {
  addScreenshot,
  createBatch,
  createManualOrder,
  deleteBatch,
  deleteOrder,
  deleteScreenshot,
  getBatch,
  getBatchSummary,
  getScreenshot,
  getAppSettings,
  listAllOrders,
  listBatches,
  listOrders,
  listScreenshots,
  saveAppSettings,
  screenshotHashExists,
  updateOrder
} from "./store";
console.log("[boot] store loaded");
import { buildCsvExport, buildExcelExport, buildPdfExport } from "./export";
console.log("[boot] export loaded (puppeteer import resolved)");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
console.log("[boot] express app created");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

function errorStatus(message: string) {
  if (/not found/i.test(message)) return 404;
  if (/invalid|unsupported|required|large|duplicate/i.test(message)) return 400;
  return 500;
}

function sendFileBuffer(res: express.Response, file: { buffer: Buffer; contentType: string; filename: string }) {
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Length", String(file.buffer.length));
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename.replace(/"/g, "_")}"`);
  res.send(file.buffer);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "OrderLedger" });
});

app.get("/api/settings", (_req, res) => {
  try {
    const settings = getAppSettings();
    res.json({ settings: { ...settings, openrouter_api_key: settings.openrouter_api_key ? "••••••••" : "" } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/settings", (req, res) => {
  try {
    const body = req.body ?? {};
    const current = getAppSettings();
    const patch = {
      ...body,
      openrouter_api_key: body.openrouter_api_key === "••••••••" ? current.openrouter_api_key : body.openrouter_api_key
    };
    const settings = saveAppSettings(patch);
    res.json({ settings: { ...settings, openrouter_api_key: settings.openrouter_api_key ? "••••••••" : "" } });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.get("/api/settings/openrouter-models", async (_req, res) => {
  try {
    const settings = getAppSettings();
    const base = (settings.openrouter_base_url || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    const response = await fetch(`${base}/models`, {
      headers: settings.openrouter_api_key ? { Authorization: `Bearer ${settings.openrouter_api_key}` } : undefined
    });
    if (!response.ok) throw new Error(`Model list failed (${response.status})`);
    const payload = await response.json() as any;
    const models = Array.isArray(payload?.data)
      ? payload.data
          .filter((item: any) => Array.isArray(item.architecture?.input_modalities) && item.architecture.input_modalities.includes("image"))
          .map((item: any) => ({
            id: String(item.id ?? ""),
            name: String(item.name ?? item.id ?? ""),
            context_length: Number(item.context_length ?? 0) || 0,
            pricing: item.pricing ?? {}
          }))
          .filter((item: any) => item.id)
      : [];
    res.json({ models });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.post("/api/batches", (req, res) => {
  try {
    res.json({ batch: createBatch(req.body ?? {}) });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.get("/api/batches", (_req, res) => {
  try {
    res.json({ batches: listBatches() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/batches/:id", (req, res) => {
  try {
    const batch = getBatch(req.params.id);
    if (!batch) return void res.status(404).json({ error: "Batch not found" });
    res.json({ batch, summary: getBatchSummary(batch.id), orders: listOrders(batch.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/batches/:id", (req, res) => {
  try {
    if (!deleteBatch(req.params.id)) return void res.status(404).json({ error: "Batch not found" });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/batches/:id/screenshots", upload.array("files", 80), async (req, res) => {
  try {
    const batchId = String(req.params.id);
    const batch = getBatch(batchId);
    if (!batch) return void res.status(404).json({ error: "Batch not found" });
    const files = (req.files ?? []) as Express.Multer.File[];
    const added = [];
    const skipped = [];
    for (const file of files) {
      const hash = createHash("sha256").update(file.buffer).digest("hex");
      if (screenshotHashExists(batch.id, hash)) {
        skipped.push({ filename: file.originalname, reason: "duplicate" });
        continue;
      }
      const id = uuid("shot");
      const stored = await writeScreenshotImage({
        batchId: batch.id,
        screenshotId: id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer
      });
      const guess = guessSourceAppFromText(file.originalname);
      added.push(addScreenshot({
        id,
        batchId: batch.id,
        originalName: file.originalname,
        storagePath: stored.storagePath,
        contentHash: stored.contentHash,
        sourceAppGuess: guess,
        width: stored.width,
        height: stored.height
      }));
    }
    res.json({ added, skipped, summary: getBatchSummary(batch.id) });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.get("/api/batches/:id/screenshots", (req, res) => {
  try {
    if (!getBatch(req.params.id)) return void res.status(404).json({ error: "Batch not found" });
    res.json({ screenshots: listScreenshots(req.params.id), summary: getBatchSummary(req.params.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/screenshots/:id/image", (req, res) => {
  try {
    const shot = getScreenshot(req.params.id);
    if (!shot) return void res.status(404).json({ error: "Screenshot not found" });
    const path = readStoredImage(shot.storage_path);
    res.setHeader("Cache-Control", "private, max-age=86400");
    createReadStream(path).pipe(res);
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.delete("/api/screenshots/:id", (req, res) => {
  try {
    if (!deleteScreenshot(req.params.id)) return void res.status(404).json({ error: "Screenshot not found" });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.post("/api/batches/:id/process", async (req, res) => {
  try {
    res.json({ summary: await processBatch(req.params.id, { force: Boolean(req.body?.force) }) });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.post("/api/processing/stop", (_req, res) => {
  try {
    res.json({ stopped: stopAllProcessing() });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.get("/api/orders", (_req, res) => {
  try {
    res.json({ orders: listAllOrders() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/batches/:id/orders", (req, res) => {
  try {
    if (!getBatch(req.params.id)) return void res.status(404).json({ error: "Batch not found" });
    res.json({ orders: listOrders(req.params.id), summary: getBatchSummary(req.params.id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/orders", (req, res) => {
  try {
    const body = req.body ?? {};
    const totalAmount = Math.max(0, Number(body.total_amount ?? 0) || 0);
    const refundAmount = Math.max(0, Number(body.refund_amount ?? 0) || 0);
    const order = createManualOrder({
      batchId: String(body.batch_id || ""),
      sourceScreenshotId: String(body.source_screenshot_id || ""),
      sourceApp: body.source_app || "unknown",
      orderedAt: String(body.ordered_at || new Date().toISOString().slice(0, 19)),
      restaurantName: String(body.restaurant_name || "Unknown restaurant").trim(),
      totalAmount,
      status: body.status || "completed",
      refundAmount,
      netAmount: Math.max(0, Number(body.net_amount ?? totalAmount - refundAmount) || 0),
      itemsText: String(body.items_text || "")
    });
    res.json({ order });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.patch("/api/orders/:id", (req, res) => {
  try {
    const order = updateOrder(req.params.id, req.body ?? {});
    if (!order) return void res.status(404).json({ error: "Order not found" });
    res.json({ order });
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.delete("/api/orders/:id", (req, res) => {
  try {
    if (!deleteOrder(req.params.id)) return void res.status(404).json({ error: "Order not found" });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/batches/:id/export.xls", (req, res) => {
  try {
    sendFileBuffer(res, buildExcelExport(req.params.id, { month: typeof req.query.month === "string" ? req.query.month : undefined }));
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.get("/api/batches/:id/export.csv", (req, res) => {
  try {
    sendFileBuffer(res, buildCsvExport(req.params.id, { month: typeof req.query.month === "string" ? req.query.month : undefined }));
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

app.get("/api/batches/:id/export.pdf", async (req, res) => {
  try {
    sendFileBuffer(res, await buildPdfExport(req.params.id, { month: typeof req.query.month === "string" ? req.query.month : undefined }));
  } catch (error: any) {
    res.status(errorStatus(error.message)).json({ error: error.message });
  }
});

const port = Number(process.env.PORT || 8788);
const host = process.env.HOST || "127.0.0.1";
console.log(`[boot] calling app.listen(${port}, ${host})`);
app.listen(port, host, () => {
  console.log(`[orderledger] http://${host}:${port}`);
}).on("error", (err) => {
  console.error(`[boot] listen failed: ${err.message}`);
});
