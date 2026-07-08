import { compareAmounts, scanAmountCandidates } from "./amount-check";
import { extractWithOpenRouter } from "./openrouter";
import { guessSourceAppFromText, normalizeExtractedOrder } from "../normalize";
import { runOcrQueued } from "../ocr/ocr-runner";
import {
  clearScreenshotExtraction,
  getAppSettings,
  getBatch,
  getBatchSummary,
  listScreenshots,
  markScreenshotLlm,
  markScreenshotOcr,
  markScreenshotProcessed,
  upsertOrder
} from "../store";
import type { AmountCandidate, AmountCheck, AmountCheckState, Batch, ExtractedOrder, OcrRow, ReviewState, Screenshot, SourceApp } from "../types";

type OcrResult = {
  rows: OcrRow[];
  error: string;
  sourceAppGuess: SourceApp;
};

type LlmResult = {
  result: Awaited<ReturnType<typeof extractWithOpenRouter>>;
  error: string;
  extractionEngine: string;
  normalizedOrders: NormalizedOrder[];
  aiCandidates: AmountCandidate[];
};

type NormalizedOrder = {
  raw: ExtractedOrder & { screenOrder: number };
  normalized: ReturnType<typeof normalizeExtractedOrder>;
};

let activeController: AbortController | null = null;

export function stopAllProcessing() {
  if (!activeController || activeController.signal.aborted) return false;
  activeController.abort();
  return true;
}

function stoppedError(error: any) {
  if (error?.name === "AbortError") return "Processing stopped";
  return error?.message || "Processing failed";
}

function reviewStateFromAmountCheck(state: AmountCheckState): ReviewState {
  return state === "matched" ? "ok" : "needs_check";
}

function sourceGuessFromOcr(screenshot: Screenshot, rows: OcrRow[]) {
  const allText = rows.map((row) => row.text).join("\n");
  const guessed = guessSourceAppFromText(allText);
  return guessed === "unknown" ? screenshot.source_app_guess : guessed;
}

function sourceGuessFromLlm(result: NonNullable<LlmResult["result"]>, fallback: SourceApp) {
  const text = [
    result.sourceApp,
    ...result.orders.flatMap((order) => [
      order.sourceApp,
      order.restaurantName,
      order.itemsText,
      order.status,
      order.orderedAt
    ])
  ].filter(Boolean).join("\n");
  const guessed = guessSourceAppFromText(text);
  return guessed === "unknown" ? (result.sourceApp ?? fallback) : guessed;
}

function unavailableAmountCheck(aiCandidates: AmountCandidate[], reasons: string[]) {
  const amountCheck = compareAmounts({ aiCandidates, scannerCandidates: [] });
  amountCheck.state = "unavailable";
  for (const reason of reasons) {
    if (!amountCheck.reasons.includes(reason)) amountCheck.reasons.push(reason);
  }
  return amountCheck;
}

function normalizeLlmOrders(batch: Batch, result: NonNullable<LlmResult["result"]>, sourceAppGuess: SourceApp): NormalizedOrder[] {
  return result.orders
    .map((order, index) => ({
      raw: {
        ...order,
        screenOrder: Number.isFinite(Number(order.screenOrder)) && Number(order.screenOrder) > 0
          ? Number(order.screenOrder)
          : index + 1
      },
      normalized: normalizeExtractedOrder(order, {
        month: batch.month,
        sourceApp: order.sourceApp ?? result.sourceApp ?? sourceAppGuess
      })
    }))
    .filter(({ normalized }) => normalized.restaurantName || normalized.totalAmount > 0)
    .sort((a, b) => Number(a.raw.screenOrder) - Number(b.raw.screenOrder));
}

function aiCandidatesFromOrders(normalizedOrders: NormalizedOrder[]) {
  return normalizedOrders
    .filter(({ normalized }) => normalized.totalAmount > 0)
    .map(({ normalized }) => ({ amount: normalized.totalAmount, text: normalized.restaurantName || "AI amount" }));
}

function persistScreenshotOrders(input: {
  batchId: string;
  screenshot: Screenshot;
  sourceAppGuess: SourceApp;
  normalizedOrders: NormalizedOrder[];
  amountCheck: AmountCheck;
  extractionEngine: string;
  ocrRows?: OcrRow[];
  error?: string;
}) {
  if (input.error) {
    markScreenshotProcessed(input.screenshot.id, {
      error: input.error,
      ocrRows: input.ocrRows,
      sourceAppGuess: input.sourceAppGuess,
      extractionEngine: input.extractionEngine
    });
    return;
  }

  const reviewState = reviewStateFromAmountCheck(input.amountCheck.state);
  let extractedOrderCount = 0;

  for (const { raw, normalized } of input.normalizedOrders) {
    upsertOrder({
      batchId: input.batchId,
      sourceApp: normalized.sourceApp,
      orderedAt: normalized.orderedAt,
      restaurantName: normalized.restaurantName,
      totalAmount: normalized.totalAmount,
      status: normalized.status,
      refundAmount: normalized.refundAmount,
      netAmount: normalized.netAmount,
      itemsText: normalized.itemsText,
      reviewState,
      duplicateKey: normalized.duplicateKey,
      sourceScreenshotId: input.screenshot.id,
      evidence: {
        screenOrder: raw.screenOrder,
        amountCheck: {
          state: input.amountCheck.state,
          reasons: input.amountCheck.reasons,
          aiAmounts: input.amountCheck.aiAmounts,
          scannerAmounts: input.amountCheck.scannerAmounts
        }
      }
    });
    extractedOrderCount += 1;
  }

  markScreenshotProcessed(input.screenshot.id, {
    error: "",
    ocrRows: input.ocrRows,
    sourceAppGuess: input.sourceAppGuess,
    extractedOrderCount,
    extractionEngine: input.extractionEngine,
    amountCheck: input.amountCheck
  });
}

export async function processBatch(batchId: string, opts: { force?: boolean } = {}) {
  if (activeController && !activeController.signal.aborted) {
    throw new Error("Processing is already running. Stop it before starting another read.");
  }
  const batch = getBatch(batchId);
  if (!batch) throw new Error("Batch not found");

  const controller = new AbortController();
  activeController = controller;
  const signal = controller.signal;

  const settings = getAppSettings();
  const ocrAmountCheckerEnabled = settings.ocr_amount_checker_enabled;
  const screenshots = listScreenshots(batchId).filter((shot) => opts.force || !shot.processed_at);
  const llmRunIso = new Date().toISOString();
  const totalShots = screenshots.length;

  try {
    for (const screenshot of screenshots) {
      clearScreenshotExtraction(screenshot.id);
    }

    const ocrResults = new Map<string, OcrResult>();

    const llmTasks = screenshots.map(async (screenshot, index): Promise<[string, LlmResult]> => {
      const extractionEngine = `openrouter:${settings.openrouter_model}|run:${llmRunIso}|shot:${index + 1}/${totalShots}`;
      markScreenshotLlm(screenshot.id, { status: "running", extractionEngine });
      try {
        const result = await extractWithOpenRouter({
          screenshot,
          sourceAppGuess: screenshot.source_app_guess,
          signal
        });
        if (!result) {
          throw new Error("OpenRouter API key is required to extract orders.");
        }
        const sourceAppGuess = sourceGuessFromLlm(result, screenshot.source_app_guess);
        const normalizedOrders = normalizeLlmOrders(batch, result, sourceAppGuess);
        const aiCandidates = aiCandidatesFromOrders(normalizedOrders);
        const pendingAmountCheck = ocrAmountCheckerEnabled
          ? unavailableAmountCheck(aiCandidates, ["amount_scan_pending"])
          : unavailableAmountCheck(aiCandidates, ["ocr_amount_checker_disabled", "manual_check_required"]);
        persistScreenshotOrders({
          batchId,
          screenshot,
          sourceAppGuess,
          normalizedOrders,
          amountCheck: pendingAmountCheck,
          extractionEngine
        });
        markScreenshotLlm(screenshot.id, { status: "done", extractionEngine });
        return [screenshot.id, { result, error: "", extractionEngine, normalizedOrders, aiCandidates }];
      } catch (error: any) {
        const message = stoppedError(error);
        markScreenshotLlm(screenshot.id, { status: "failed", extractionEngine, error: message });
        markScreenshotProcessed(screenshot.id, {
          error: message,
          sourceAppGuess: screenshot.source_app_guess,
          extractionEngine
        });
        return [screenshot.id, { result: null, error: message, extractionEngine, normalizedOrders: [], aiCandidates: [] }];
      }
    });

    for (const screenshot of screenshots) {
      if (signal.aborted) {
        const stopped: OcrResult = { rows: [], error: "Processing stopped", sourceAppGuess: screenshot.source_app_guess };
        ocrResults.set(screenshot.id, stopped);
        markScreenshotOcr(screenshot.id, { status: "failed", rows: [], sourceAppGuess: screenshot.source_app_guess, error: stopped.error });
        continue;
      }

      if (!ocrAmountCheckerEnabled) {
        const skipped: OcrResult = { rows: [], error: "", sourceAppGuess: screenshot.source_app_guess };
        ocrResults.set(screenshot.id, skipped);
        markScreenshotOcr(screenshot.id, { status: "skipped", rows: [], sourceAppGuess: screenshot.source_app_guess });
        continue;
      }

      markScreenshotOcr(screenshot.id, { status: "running" });
      try {
        const rows = await runOcrQueued(screenshot, signal);
        const sourceAppGuess = sourceGuessFromOcr(screenshot, rows);
        const done: OcrResult = { rows, error: "", sourceAppGuess };
        ocrResults.set(screenshot.id, done);
        markScreenshotOcr(screenshot.id, { status: "done", rows, sourceAppGuess });
      } catch (error: any) {
        const message = stoppedError(error);
        const failed: OcrResult = { rows: [], error: message, sourceAppGuess: screenshot.source_app_guess };
        ocrResults.set(screenshot.id, failed);
        markScreenshotOcr(screenshot.id, { status: "failed", rows: [], sourceAppGuess: screenshot.source_app_guess, error: message });
      }
    }

    const llmResults = new Map(await Promise.all(llmTasks));

    if (signal.aborted) {
      for (const screenshot of screenshots) {
        markScreenshotProcessed(screenshot.id, { error: "Processing stopped" });
      }
      return getBatchSummary(batchId);
    }

    for (const screenshot of screenshots) {
      if (signal.aborted) {
        markScreenshotProcessed(screenshot.id, { error: "Processing stopped" });
        continue;
      }
      const ocr = ocrResults.get(screenshot.id) ?? { rows: [], error: "OCR did not finish", sourceAppGuess: screenshot.source_app_guess };
      const llm = llmResults.get(screenshot.id);

      try {
        if (!llm || !llm.result) {
          throw new Error(llm?.error || "LLM extraction failed");
        }

        const amountCheck = !ocrAmountCheckerEnabled
          ? unavailableAmountCheck(llm.aiCandidates, ["ocr_amount_checker_disabled", "manual_check_required"])
          : ocr.error
            ? unavailableAmountCheck(llm.aiCandidates, ["amount_scan_unavailable", "manual_check_required"])
            : compareAmounts({
                aiCandidates: llm.aiCandidates,
                scannerCandidates: scanAmountCandidates(ocr.rows)
              });

        persistScreenshotOrders({
          batchId,
          screenshot,
          ocrRows: ocr.rows,
          sourceAppGuess: ocr.sourceAppGuess,
          normalizedOrders: llm.normalizedOrders,
          extractionEngine: llm.extractionEngine,
          amountCheck
        });
      } catch (error: any) {
        markScreenshotProcessed(screenshot.id, {
          error: error?.message || "Processing failed",
          ocrRows: ocr.rows,
          sourceAppGuess: ocr.sourceAppGuess,
          extractionEngine: llm?.extractionEngine
        });
      }
    }

    return getBatchSummary(batchId);
  } finally {
    if (activeController === controller) activeController = null;
  }
}
