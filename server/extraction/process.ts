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
import type { AmountCandidate, AmountCheckState, OcrRow, ReviewState, Screenshot, SourceApp } from "../types";

type OcrResult = {
  rows: OcrRow[];
  error: string;
  sourceAppGuess: SourceApp;
};

type LlmResult = {
  result: Awaited<ReturnType<typeof extractWithOpenRouter>>;
  error: string;
  extractionEngine: string;
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

function unavailableAmountCheck(aiCandidates: AmountCandidate[], reasons: string[]) {
  const amountCheck = compareAmounts({ aiCandidates, scannerCandidates: [] });
  amountCheck.state = "unavailable";
  for (const reason of reasons) {
    if (!amountCheck.reasons.includes(reason)) amountCheck.reasons.push(reason);
  }
  return amountCheck;
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
        markScreenshotLlm(screenshot.id, { status: "done", extractionEngine });
        return [screenshot.id, { result, error: "", extractionEngine }];
      } catch (error: any) {
        const message = stoppedError(error);
        markScreenshotLlm(screenshot.id, { status: "failed", extractionEngine, error: message });
        return [screenshot.id, { result: null, error: message, extractionEngine }];
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

        const normalizedOrders = llm.result.orders
          .map((order, index) => ({
            raw: {
              ...order,
              screenOrder: Number.isFinite(Number(order.screenOrder)) && Number(order.screenOrder) > 0
                ? Number(order.screenOrder)
                : index + 1
            },
            normalized: normalizeExtractedOrder(order, {
              month: batch.month,
              sourceApp: order.sourceApp ?? llm.result?.sourceApp ?? ocr.sourceAppGuess
            })
          }))
          .filter(({ normalized }) => normalized.restaurantName || normalized.totalAmount > 0)
          .sort((a, b) => Number(a.raw.screenOrder) - Number(b.raw.screenOrder));

        const aiCandidates: AmountCandidate[] = normalizedOrders
          .filter(({ normalized }) => normalized.totalAmount > 0)
          .map(({ normalized }) => ({ amount: normalized.totalAmount, text: normalized.restaurantName || "AI amount" }));

        const amountCheck = !ocrAmountCheckerEnabled
          ? unavailableAmountCheck(aiCandidates, ["ocr_amount_checker_disabled", "manual_check_required"])
          : ocr.error
            ? unavailableAmountCheck(aiCandidates, ["amount_scan_unavailable", "manual_check_required"])
            : compareAmounts({
                aiCandidates,
                scannerCandidates: scanAmountCandidates(ocr.rows)
              });

        const reviewState = reviewStateFromAmountCheck(amountCheck.state);
        let extractedOrderCount = 0;

        for (const { raw, normalized } of normalizedOrders) {
          upsertOrder({
            batchId,
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
            sourceScreenshotId: screenshot.id,
            evidence: {
              screenOrder: raw.screenOrder,
              amountCheck: {
                state: amountCheck.state,
                reasons: amountCheck.reasons,
                aiAmounts: amountCheck.aiAmounts,
                scannerAmounts: amountCheck.scannerAmounts
              }
            }
          });
          extractedOrderCount += 1;
        }

        markScreenshotProcessed(screenshot.id, {
          error: "",
          ocrRows: ocr.rows,
          sourceAppGuess: ocr.sourceAppGuess,
          extractedOrderCount,
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
