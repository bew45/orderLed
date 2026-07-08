import { spawn } from "child_process";
import { readStoredImage } from "../image-store";
import { getAppSettings } from "../store";
import type { OcrRow, Screenshot } from "../types";

const DEFAULT_TIMEOUT_MS = 90000;

function pythonCommand() {
  return getAppSettings().paddle_python || process.env.PYTHON || "python";
}

function paddleLang() {
  return getAppSettings().paddle_lang || "th";
}

function paddleDevice() {
  return getAppSettings().paddle_device || "gpu";
}

function timeoutMs() {
  return Math.max(1000, Number(getAppSettings().paddle_timeout_ms ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
}

let queue = Promise.resolve();

export function runOcrQueued(screenshot: Screenshot, signal?: AbortSignal) {
  const next = queue.then(() => runPaddleOcr(screenshot, signal));
  queue = next.then(() => undefined, () => undefined);
  return next;
}

async function runPaddleOcr(screenshot: Screenshot, signal?: AbortSignal): Promise<OcrRow[]> {
  if (signal?.aborted) throw new Error("Processing stopped");
  const imagePath = readStoredImage(screenshot.storage_path);
  const helper = "scripts/paddle_ocr_worker.py";

  return await new Promise((resolve, reject) => {
    const child = spawn(pythonCommand(), [helper, imagePath, "--lang", paddleLang(), "--device", paddleDevice()], {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8"
      }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = (message = "Processing stopped") => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        // best effort
      }
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abortStop);
      reject(new Error(message));
    };
    const abortStop = () => stop();
    timer = setTimeout(() => {
      stop("PaddleOCR timed out");
    }, timeoutMs());
    signal?.addEventListener("abort", abortStop, { once: true });

    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abortStop);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abortStop);
      try {
        const payload = JSON.parse(stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "{}");
        if (!payload.ok) throw new Error(payload.error || stderr || `PaddleOCR exited with ${code}`);
        const rows = Array.isArray(payload.boxes) ? payload.boxes : [];
        resolve(rows.map((row: any, index: number) => ({
          id: `ocr_${String(index + 1).padStart(4, "0")}`,
          text: String(row.text ?? "").trim(),
          confidence: Math.max(0, Math.min(1, Number(row.confidence ?? 0) || 0)),
          bbox: {
            x: Math.max(0, Math.min(1, Number(row.bbox?.x ?? 0) || 0)),
            y: Math.max(0, Math.min(1, Number(row.bbox?.y ?? 0) || 0)),
            w: Math.max(0, Math.min(1, Number(row.bbox?.w ?? 0) || 0)),
            h: Math.max(0, Math.min(1, Number(row.bbox?.h ?? 0) || 0))
          }
        })).filter((row: OcrRow) => row.text));
      } catch (error: any) {
        reject(new Error(error?.message || stderr || "PaddleOCR failed"));
      }
    });
  });
}
