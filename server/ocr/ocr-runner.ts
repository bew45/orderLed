import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join, resolve } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { readStoredImage } from "../image-store";
import { getAppSettings } from "../store";
import type { OcrRow, Screenshot } from "../types";

const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_MAX_OCR_EDGE = 2000;
const RESPONSE_PREFIX = "ORDERLEDGER_PADDLE_JSON ";

type WorkerConfig = {
  python: string;
  lang: string;
  device: string;
};

type WorkerState = WorkerConfig & {
  child: ChildProcessWithoutNullStreams;
  ready: boolean;
  readyPromise: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  stdoutBuffer: string;
  stderrTail: string;
};

type QueueEntry = {
  id: string;
  imagePath: string;
  cleanupImage: () => void;
  signal?: AbortSignal;
  timer?: ReturnType<typeof setTimeout>;
  child?: ChildProcessWithoutNullStreams;
  removeAbort?: () => void;
  settled: boolean;
  resolve: (rows: OcrRow[]) => void;
  reject: (error: Error) => void;
};

let workerState: WorkerState | null = null;
let inFlight: QueueEntry | null = null;
const queue: QueueEntry[] = [];

// Consecutive worker-init failures. After MAX_INIT_FAILURES in a row the Python env is
// assumed broken and the remaining queue is drained instead of failing one entry at a
// time (each failed init can cost several seconds of Paddle import time).
let consecutiveInitFailures = 0;
const MAX_INIT_FAILURES = 3;

function bundledVenvPython() {
  const venvPython = join(process.cwd(), ".venv-ocr", "Scripts", "python.exe");
  return existsSync(venvPython) ? venvPython : "";
}

function pythonCommand() {
  return getAppSettings().paddle_python || process.env.PYTHON || bundledVenvPython() || "python";
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

function maxOcrEdge() {
  return Math.max(800, Number(process.env.ORDERLEDGER_OCR_MAX_EDGE ?? DEFAULT_MAX_OCR_EDGE) || DEFAULT_MAX_OCR_EDGE);
}

function currentConfig(): WorkerConfig {
  return {
    python: pythonCommand(),
    lang: paddleLang(),
    device: paddleDevice()
  };
}

function paddleEnv(config: WorkerConfig) {
  const env: Record<string, string> = {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True"
  };

  const venvRoot = resolve(dirname(config.python), "..");
  const acceleratorBins = [
    join(venvRoot, "Lib", "site-packages", "nvidia", "cu13", "bin", "x86_64"),
    join(venvRoot, "Lib", "site-packages", "nvidia", "cudnn", "bin")
  ].filter((path) => existsSync(path));

  if (acceleratorBins.length > 0) {
    env.PATH = [...acceleratorBins, process.env.PATH || ""].filter(Boolean).join(";");
  }

  return env;
}

function sameConfig(worker: WorkerState, config: WorkerConfig) {
  return worker.python === config.python && worker.lang === config.lang && worker.device === config.device;
}

async function prepareOcrImage(imagePath: string): Promise<{ imagePath: string; cleanup: () => void }> {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const maxEdge = maxOcrEdge();

  if (!width || !height || Math.max(width, height) <= maxEdge) {
    return { imagePath, cleanup: () => undefined };
  }

  const tempDir = join(tmpdir(), "orderledger-ocr");
  mkdirSync(tempDir, { recursive: true });
  const resizedPath = join(tempDir, `${randomUUID()}.png`);

  await sharp(imagePath)
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true
    })
    .png()
    .toFile(resizedPath);

  return {
    imagePath: resizedPath,
    cleanup: () => {
      try {
        rmSync(resizedPath, { force: true });
      } catch {
        // best effort
      }
    }
  };
}

function startWorker(config = currentConfig()) {
  if (workerState && sameConfig(workerState, config)) return workerState;
  stopWorker();

  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const child = spawn(config.python, ["scripts/paddle_ocr_worker.py", "--server", "--lang", config.lang, "--device", config.device], {
    cwd: process.cwd(),
    windowsHide: true,
    env: paddleEnv(config)
  });

  const state: WorkerState = {
    ...config,
    child,
    ready: false,
    readyPromise,
    resolveReady,
    rejectReady,
    stdoutBuffer: "",
    stderrTail: ""
  };

  workerState = state;

  child.stdout.on("data", (chunk) => {
    state.stdoutBuffer += chunk.toString("utf8");
    consumeWorkerStdout(state);
  });
  child.stderr.on("data", (chunk) => {
    state.stderrTail = (state.stderrTail + chunk.toString("utf8")).slice(-4000);
  });
  child.on("error", (error) => handleWorkerExit(state, error));
  child.on("close", (code) => handleWorkerExit(state, new Error(state.stderrTail || `PaddleOCR worker exited with ${code}`)));

  return state;
}

function stopWorker() {
  const state = workerState;
  workerState = null;
  if (!state) return;
  try {
    state.child.kill();
  } catch {
    // best effort
  }
}

function consumeWorkerStdout(state: WorkerState) {
  while (true) {
    const newlineIndex = state.stdoutBuffer.search(/\r?\n/);
    if (newlineIndex < 0) return;

    const line = state.stdoutBuffer.slice(0, newlineIndex).trim();
    state.stdoutBuffer = state.stdoutBuffer.slice(state.stdoutBuffer[newlineIndex] === "\r" ? newlineIndex + 2 : newlineIndex + 1);
    if (!line.startsWith(RESPONSE_PREFIX)) continue;

    try {
      handleWorkerPayload(state, JSON.parse(line.slice(RESPONSE_PREFIX.length)));
    } catch (error: any) {
      if (!state.ready) {
        state.rejectReady(new Error(error?.message || "PaddleOCR worker sent invalid JSON"));
      } else if (inFlight?.child === state.child) {
        finishEntryWithError(inFlight, new Error(error?.message || "PaddleOCR worker sent invalid JSON"));
      }
    }
  }
}

function handleWorkerPayload(state: WorkerState, payload: any) {
  if (payload.ready !== undefined) {
    if (payload.ok) {
      state.ready = true;
      state.resolveReady();
    } else {
      state.rejectReady(new Error(payload.error || "PaddleOCR worker failed to start"));
    }
    return;
  }

  if (!inFlight || inFlight.child !== state.child || payload.id !== inFlight.id) return;

  if (!payload.ok) {
    finishEntryWithError(inFlight, new Error(payload.error || state.stderrTail || "PaddleOCR failed"));
    return;
  }

  finishEntryWithRows(inFlight, rowsFromPayload(payload));
}

function handleWorkerExit(state: WorkerState, error: Error) {
  if (!state.ready) state.rejectReady(error);
  if (workerState === state) workerState = null;
  if (inFlight?.child === state.child) {
    finishEntryWithError(inFlight, error);
    return;
  }
  pumpQueue();
}

function rowsFromPayload(payload: any): OcrRow[] {
  const rows = Array.isArray(payload.boxes) ? payload.boxes : [];
  return rows.map((row: any, index: number) => ({
    id: `ocr_${String(index + 1).padStart(4, "0")}`,
    text: String(row.text ?? "").trim(),
    confidence: Math.max(0, Math.min(1, Number(row.confidence ?? 0) || 0)),
    bbox: {
      x: Math.max(0, Math.min(1, Number(row.bbox?.x ?? 0) || 0)),
      y: Math.max(0, Math.min(1, Number(row.bbox?.y ?? 0) || 0)),
      w: Math.max(0, Math.min(1, Number(row.bbox?.w ?? 0) || 0)),
      h: Math.max(0, Math.min(1, Number(row.bbox?.h ?? 0) || 0))
    }
  })).filter((row: OcrRow) => row.text);
}

function pumpQueue() {
  if (inFlight || queue.length === 0) return;
  const entry = queue.shift();
  if (!entry || entry.settled) {
    pumpQueue();
    return;
  }

  inFlight = entry;
  void dispatchEntry(entry);
}

function drainQueue(error: Error) {
  const entries = queue.splice(0, queue.length);
  for (const entry of entries) {
    if (entry.settled) continue;
    entry.settled = true;
    cleanupEntry(entry);
    entry.reject(error);
  }
}

async function dispatchEntry(entry: QueueEntry) {
  try {
    const state = startWorker();
    entry.child = state.child;
    await state.readyPromise;
    consecutiveInitFailures = 0;
    if (entry.settled || inFlight !== entry) return;

    entry.timer = setTimeout(() => {
      stopWorker();
      finishEntryWithError(entry, new Error("PaddleOCR timed out"));
    }, timeoutMs());

    state.child.stdin.write(JSON.stringify({ id: entry.id, image: entry.imagePath }) + "\n", "utf8");
  } catch (error: any) {
    const err = new Error(error?.message || "PaddleOCR failed");
    consecutiveInitFailures += 1;
    if (consecutiveInitFailures >= MAX_INIT_FAILURES) {
      drainQueue(new Error(`PaddleOCR worker unavailable: ${err.message}`));
    }
    finishEntryWithError(entry, err);
  }
}

function finishEntryWithRows(entry: QueueEntry, rows: OcrRow[]) {
  if (entry.settled) return;
  entry.settled = true;
  cleanupEntry(entry);
  entry.resolve(rows);
  if (inFlight === entry) inFlight = null;
  pumpQueue();
}

function finishEntryWithError(entry: QueueEntry, error: Error) {
  if (entry.settled) return;
  entry.settled = true;
  cleanupEntry(entry);
  entry.reject(error);
  if (inFlight === entry) inFlight = null;
  pumpQueue();
}

function cleanupEntry(entry: QueueEntry) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.removeAbort?.();
  entry.cleanupImage();
}

function cancelEntry(entry: QueueEntry) {
  if (entry.settled) return;

  const queuedIndex = queue.indexOf(entry);
  if (queuedIndex >= 0) {
    queue.splice(queuedIndex, 1);
    finishEntryWithError(entry, new Error("Processing stopped"));
    return;
  }

  if (inFlight === entry) {
    stopWorker();
    finishEntryWithError(entry, new Error("Processing stopped"));
  }
}

export async function runOcrQueued(screenshot: Screenshot, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Processing stopped");

  const storedImagePath = readStoredImage(screenshot.storage_path);
  const prepared = await prepareOcrImage(storedImagePath);

  return await new Promise<OcrRow[]>((resolve, reject) => {
    const entry: QueueEntry = {
      id: randomUUID(),
      imagePath: prepared.imagePath,
      cleanupImage: prepared.cleanup,
      signal,
      settled: false,
      resolve,
      reject
    };

    if (signal) {
      const abortHandler = () => cancelEntry(entry);
      entry.removeAbort = () => signal.removeEventListener("abort", abortHandler);
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    queue.push(entry);
    pumpQueue();
  });
}
