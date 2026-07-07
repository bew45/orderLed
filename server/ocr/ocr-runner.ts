import { spawn } from "child_process";
import { readStoredImage } from "../image-store";
import type { OcrRow, Screenshot } from "../types";

const DEFAULT_TIMEOUT_MS = 90000;

function pythonCommand() {
  return process.env.ORDERLEDGER_PADDLE_PYTHON || process.env.PYTHON || "python";
}

function paddleLang() {
  return process.env.ORDERLEDGER_PADDLE_LANG || "th";
}

function timeoutMs() {
  return Math.max(1000, Number(process.env.ORDERLEDGER_PADDLE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
}

let queue = Promise.resolve();

export function runOcrQueued(screenshot: Screenshot) {
  const next = queue.then(() => runPaddleOcr(screenshot));
  queue = next.then(() => undefined, () => undefined);
  return next;
}

async function runPaddleOcr(screenshot: Screenshot): Promise<OcrRow[]> {
  const imagePath = readStoredImage(screenshot.storage_path);
  const helper = "scripts/paddle_ocr_worker.py";

  return await new Promise((resolve, reject) => {
    const child = spawn(pythonCommand(), [helper, imagePath, "--lang", paddleLang()], {
      cwd: process.cwd(),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // best effort
      }
      reject(new Error("PaddleOCR timed out"));
    }, timeoutMs());

    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
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
