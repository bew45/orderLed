import { compareAmounts, scanAmountCandidates, verifyOrderAmount } from "./amount-check";
import { assessOrder } from "./confidence";
import { extractWithOpenRouter } from "./openrouter";
import { duplicateKey as makeDuplicateKey, guessSourceAppFromText, normalizeExtractedOrder } from "../normalize";
import { runOcrQueued } from "../ocr/ocr-runner";
import {
  clearScreenshotExtraction,
  getAppSettings,
  getBatch,
  getBatchSummary,
  getScreenshot,
  listScreenshots,
  markScreenshotLlm,
  markScreenshotOcr,
  markScreenshotProcessed,
  recordFieldEvidence,
  recordOrderObservation,
  finishExtractionRun,
  startExtractionRun,
  upsertOrder
} from "../store";
import type { AmountCandidate, AmountCheck, ExtractedOrder, OcrRow, Screenshot, SourceApp } from "../types";

type OcrResult = {
  rows: OcrRow[];
  error: string;
  sourceAppGuess: SourceApp;
  attentionReasons: string[];
};

type LlmResult = {
  result: Awaited<ReturnType<typeof extractWithOpenRouter>>;
  error: string;
  extractionEngine: string;
  normalizedOrders: NormalizedCard[];
  aiCandidates: AmountCandidate[];
  attentionReasons: string[];
};

type NormalizedCard = {
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

function containsRefundSignal(text: string) {
  const raw = text.toLowerCase();
  const compact = raw.replace(/\s+/g, "");
  return [
    "\u0e04\u0e37\u0e19\u0e40\u0e07\u0e34\u0e19",
    "\u0e40\u0e07\u0e34\u0e19\u0e04\u0e37\u0e19",
    "\u0e04\u0e37\u0e19\u0e22\u0e2d\u0e14",
    "refund",
    "refunded"
  ].some((token) => raw.includes(token) || compact.includes(token));
}

function attentionReasonsFromText(text: string) {
  return containsRefundSignal(text) ? ["refund_text_detected"] : [];
}

function mergeReasons(...groups: string[][]) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function addReasonsToAmountCheck(amountCheck: AmountCheck, reasons: string[]) {
  for (const reason of reasons) {
    if (!amountCheck.reasons.includes(reason)) amountCheck.reasons.push(reason);
  }
  return amountCheck;
}

function sourceGuessFromOcr(screenshot: Screenshot, rows: OcrRow[]) {
  const allText = rows.map((row) => row.text).join("\n");
  const guessed = guessSourceAppFromText(allText);
  return guessed === "unknown" ? screenshot.source_app_guess : guessed;
}

function attentionReasonsFromOcr(rows: OcrRow[]) {
  return attentionReasonsFromText(rows.map((row) => row.text).join("\n"));
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

function llmText(result: NonNullable<LlmResult["result"]>) {
  return [
    result.sourceApp,
    ...result.orders.flatMap((order) => [
      order.sourceApp,
      order.restaurantName,
      order.itemsText,
      order.status,
      order.orderedAt
    ])
  ].filter(Boolean).join("\n");
}

function attentionReasonsFromLlm(result: NonNullable<LlmResult["result"]>) {
  return attentionReasonsFromText(llmText(result));
}

function unavailableAmountCheck(aiCandidates: AmountCandidate[], reasons: string[]) {
  const amountCheck = compareAmounts({ aiCandidates, scannerCandidates: [] });
  amountCheck.state = "unavailable";
  for (const reason of reasons) {
    if (!amountCheck.reasons.includes(reason)) amountCheck.reasons.push(reason);
  }
  return amountCheck;
}

function normalizeLlmOrders(result: NonNullable<LlmResult["result"]>, sourceAppGuess: SourceApp, screenshotId: string): NormalizedCard[] {
  const now = Date.now();
  const rawOrders = result.orders.map((order, index) => ({
    ...order,
    screenOrder: Number.isFinite(Number(order.screenOrder)) && Number(order.screenOrder) > 0
      ? Number(order.screenOrder)
      : index + 1
  }));

  // Bug B21: models sometimes repeat "1" for every card. If screenOrder collides,
  // fall back to strict array position so downstream ordering + the B11 same-card
  // check stay reliable.
  const seen = new Set<number>();
  const hasCollision = rawOrders.some((order) => {
    if (seen.has(order.screenOrder)) return true;
    seen.add(order.screenOrder);
    return false;
  });
  if (hasCollision) rawOrders.forEach((order, index) => { order.screenOrder = index + 1; });

  const cards = rawOrders
    .map((raw) => ({
      raw,
      // Keep orders whose amount could not be read (bug B4): they land in the
      // ledger as "blocked" instead of vanishing.
      normalized: normalizeExtractedOrder(raw, {
        sourceApp: raw.sourceApp ?? result.sourceApp ?? sourceAppGuess,
        uniqueSeed: `${screenshotId}|${raw.screenOrder}`,
        now
      })
    }))
    .sort((a, b) => Number(a.raw.screenOrder) - Number(b.raw.screenOrder));

  return fillMonthsFromSiblings(cards);
}

/**
 * Step 2d (docs/REDESIGN_PLAN.md §5, decision D2): a card whose date could not be
 * read inherits its MONTH — never a fabricated day — from the nearest sibling on
 * the same screenshot that does have a full date. History lists are date-sorted,
 * so the closest card by screen position is the best guess.
 */
function fillMonthsFromSiblings(cards: NormalizedCard[]): NormalizedCard[] {
  const anchors = cards
    .filter((c) => c.normalized.datePrecision === "full" && /^\d{4}-\d{2}/.test(c.normalized.orderedAt))
    .map((c) => ({ screenOrder: c.raw.screenOrder, month: c.normalized.orderedAt.slice(0, 7) }));
  if (anchors.length === 0) return cards;

  return cards.map((card) => {
    const n = card.normalized;
    if (n.datePrecision !== "none" || n.attentionReasons.includes("date_relative")) return card;

    let best = anchors[0];
    for (const anchor of anchors) {
      if (Math.abs(anchor.screenOrder - card.raw.screenOrder) < Math.abs(best.screenOrder - card.raw.screenOrder)) {
        best = anchor;
      }
    }
    const orderedAt = best.month; // "YYYY-MM" only
    const strong = n.sourceApp !== "unknown" && Boolean(n.restaurantName);
    return {
      ...card,
      normalized: {
        ...n,
        orderedAt,
        datePrecision: "month" as const,
        attentionReasons: [...n.attentionReasons.filter((r) => r !== "date_missing"), "month_from_siblings"],
        duplicateKey: strong
          ? makeDuplicateKey({ sourceApp: n.sourceApp, orderedAt, restaurantName: n.restaurantName, totalAmount: n.totalAmount })
          : n.duplicateKey
      }
    };
  });
}

function aiCandidatesFromOrders(normalizedOrders: NormalizedCard[]) {
  return normalizedOrders
    .filter(({ normalized }) => normalized.totalAmount > 0)
    .map(({ normalized }) => ({ amount: normalized.totalAmount, text: normalized.restaurantName || "AI amount" }));
}

function persistScreenshotOrders(input: {
  batchId: string;
  screenshot: Screenshot;
  sourceAppGuess: SourceApp;
  normalizedOrders: NormalizedCard[];
  amountCheck: AmountCheck;
  ocrAvailable: boolean;
  attentionReasons?: string[];
  extractionEngine: string;
  extractionRunId: string;
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

  const attentionReasons = input.attentionReasons ?? [];
  const amountCheck = addReasonsToAmountCheck(input.amountCheck, attentionReasons);
  const ocrRows = input.ocrRows ?? [];
  let extractedOrderCount = 0;

  for (const { raw, normalized } of input.normalizedOrders) {
    const orderAttentionReasons = mergeReasons(attentionReasons, normalized.attentionReasons);

    // Per-order amount trust + confidence/tier (bugs B1, B4, B15).
    const amountSignal = verifyOrderAmount({
      totalAmount: normalized.totalAmount,
      ocrRows,
      ocrAvailable: input.ocrAvailable
    });
    const assessment = assessOrder(normalized, { amount: amountSignal });

    const order = upsertOrder({
      batchId: input.batchId,
      sourceApp: normalized.sourceApp,
      orderedAt: normalized.orderedAt,
      datePrecision: normalized.datePrecision,
      restaurantName: normalized.restaurantName,
      branch: normalized.branch,
      totalAmount: normalized.totalAmount,
      status: normalized.status,
      refundAmount: normalized.refundAmount,
      netAmount: normalized.netAmount,
      itemCount: normalized.itemCount,
      itemsText: normalized.itemsText,
      confidence: assessment.confidence,
      reviewTier: assessment.reviewTier,
      flags: assessment.flags,
      duplicateKey: normalized.duplicateKey,
      sourceScreenshotId: input.screenshot.id,
      screenOrder: raw.screenOrder,
      evidence: {
        screenOrder: raw.screenOrder,
        amountSignal,
        amountCheck: {
          state: amountCheck.state,
          reasons: mergeReasons(amountCheck.reasons, orderAttentionReasons),
          aiAmounts: amountCheck.aiAmounts,
          scannerAmounts: amountCheck.scannerAmounts
        },
        attentionReasons: orderAttentionReasons,
        flags: assessment.flags
      }
    });
    const observation = recordOrderObservation({
      extractionRunId: input.extractionRunId,
      batchId: input.batchId,
      screenshotId: input.screenshot.id,
      orderId: order.id,
      screenOrder: raw.screenOrder,
      raw,
      normalized,
      attentionReasons: orderAttentionReasons
    });
    for (const [fieldName, value] of Object.entries({
      sourceApp: normalized.sourceApp,
      orderedAt: normalized.orderedAt,
      restaurantName: normalized.restaurantName,
      totalAmount: normalized.totalAmount,
      status: normalized.status,
      refundAmount: normalized.refundAmount,
      itemsText: normalized.itemsText
    })) {
      recordFieldEvidence({ observationId: observation.id, fieldName, source: "vision", value });
    }
    recordFieldEvidence({
      observationId: observation.id,
      fieldName: "amountCheck",
      source: "rule",
      value: amountCheck
    });
    extractedOrderCount += 1;
  }

  markScreenshotProcessed(input.screenshot.id, {
    error: "",
    ocrRows: input.ocrRows,
    sourceAppGuess: input.sourceAppGuess,
    extractedOrderCount,
    extractionEngine: input.extractionEngine,
    amountCheck
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

    const llmTaskById = new Map<string, Promise<LlmResult>>();
    const extractionRunByScreenshotId = new Map<string, ReturnType<typeof startExtractionRun>>();
    const llmTasks = screenshots.map((screenshot, index): Promise<[string, LlmResult]> => {
      const extractionEngine = `openrouter:${settings.openrouter_model}|run:${llmRunIso}|shot:${index + 1}/${totalShots}`;
      extractionRunByScreenshotId.set(screenshot.id, startExtractionRun({
        batchId,
        screenshotId: screenshot.id,
        extractionEngine
      }));
      const task = (async (): Promise<[string, LlmResult]> => {
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
          const normalizedOrders = normalizeLlmOrders(result, sourceAppGuess, screenshot.id);
          const aiCandidates = aiCandidatesFromOrders(normalizedOrders);
          const attentionReasons = attentionReasonsFromLlm(result);
          markScreenshotLlm(screenshot.id, {
            status: "done",
            extractionEngine,
            usage: result.usage,
            costUsd: result.usage.costUsd
          });
          return [screenshot.id, { result, error: "", extractionEngine, normalizedOrders, aiCandidates, attentionReasons }];
        } catch (error: any) {
          const message = stoppedError(error);
          markScreenshotLlm(screenshot.id, { status: "failed", extractionEngine, error: message });
          markScreenshotProcessed(screenshot.id, {
            error: message,
            sourceAppGuess: screenshot.source_app_guess,
            extractionEngine
          });
          return [screenshot.id, { result: null, error: message, extractionEngine, normalizedOrders: [], aiCandidates: [], attentionReasons: [] }];
        }
      })();
      llmTaskById.set(screenshot.id, task.then(([, llm]) => llm));
      return task;
    });

    const finalizationTasks: Promise<void>[] = [];
    const finalizeScreenshot = async (screenshot: Screenshot, ocr: OcrResult) => {
      const llm = await llmTaskById.get(screenshot.id);
      const extractionRun = extractionRunByScreenshotId.get(screenshot.id);
      if (signal.aborted) {
        markScreenshotProcessed(screenshot.id, { error: "Processing stopped" });
        if (extractionRun) finishExtractionRun({ id: extractionRun.id, status: "stopped", error: "Processing stopped", ocrRows: ocr.rows });
        return;
      }
      try {
        if (!llm || !llm.result) {
          throw new Error(llm?.error || "LLM extraction failed");
        }

        const attentionReasons = mergeReasons(llm.attentionReasons, ocr.attentionReasons);
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
          ocrAvailable: ocrAmountCheckerEnabled && !ocr.error && ocr.rows.length > 0,
          sourceAppGuess: ocr.sourceAppGuess,
          normalizedOrders: llm.normalizedOrders,
          extractionEngine: llm.extractionEngine,
          extractionRunId: extractionRun?.id ?? "",
          amountCheck,
          attentionReasons
        });
        if (extractionRun) finishExtractionRun({
          id: extractionRun.id,
          status: "done",
          llmResult: llm.result,
          ocrRows: ocr.rows,
          amountCheck
        });
      } catch (error: any) {
        const message = error?.message || "Processing failed";
        markScreenshotProcessed(screenshot.id, {
          error: message,
          ocrRows: ocr.rows,
          sourceAppGuess: ocr.sourceAppGuess,
          extractionEngine: llm?.extractionEngine
        });
        if (extractionRun) finishExtractionRun({ id: extractionRun.id, status: "failed", error: message, ocrRows: ocr.rows });
      }
    };
    const queueFinalize = (screenshot: Screenshot, ocr: OcrResult) => {
      finalizationTasks.push(finalizeScreenshot(screenshot, ocr));
    };

    for (const screenshot of screenshots) {
      if (signal.aborted) {
        const stopped: OcrResult = { rows: [], error: "Processing stopped", sourceAppGuess: screenshot.source_app_guess, attentionReasons: [] };
        markScreenshotOcr(screenshot.id, { status: "failed", rows: [], sourceAppGuess: screenshot.source_app_guess, error: stopped.error });
        continue;
      }

      if (!ocrAmountCheckerEnabled) {
        const skipped: OcrResult = { rows: [], error: "", sourceAppGuess: screenshot.source_app_guess, attentionReasons: [] };
        markScreenshotOcr(screenshot.id, { status: "skipped", rows: [], sourceAppGuess: screenshot.source_app_guess });
        queueFinalize(screenshot, skipped);
        continue;
      }

      markScreenshotOcr(screenshot.id, { status: "running" });
      try {
        const rows = await runOcrQueued(screenshot, signal);
        const sourceAppGuess = sourceGuessFromOcr(screenshot, rows);
        const done: OcrResult = { rows, error: "", sourceAppGuess, attentionReasons: attentionReasonsFromOcr(rows) };
        markScreenshotOcr(screenshot.id, { status: "done", rows, sourceAppGuess });
        queueFinalize(screenshot, done);
      } catch (error: any) {
        const message = stoppedError(error);
        const failed: OcrResult = { rows: [], error: message, sourceAppGuess: screenshot.source_app_guess, attentionReasons: [] };
        markScreenshotOcr(screenshot.id, { status: "failed", rows: [], sourceAppGuess: screenshot.source_app_guess, error: message });
        queueFinalize(screenshot, failed);
      }
    }

    await Promise.all(finalizationTasks);
    await Promise.all(llmTasks);

    if (signal.aborted) {
      for (const screenshot of screenshots) {
        markScreenshotProcessed(screenshot.id, { error: "Processing stopped" });
        const extractionRun = extractionRunByScreenshotId.get(screenshot.id);
        if (extractionRun) finishExtractionRun({ id: extractionRun.id, status: "stopped", error: "Processing stopped" });
      }
      return getBatchSummary(batchId);
    }

    return getBatchSummary(batchId);
  } finally {
    if (activeController === controller) activeController = null;
  }
}

export async function processSingleScreenshot(screenshotId: string) {
  if (activeController && !activeController.signal.aborted) {
    throw new Error("Processing is already running. Stop it before starting another read.");
  }
  const screenshot = getScreenshot(screenshotId);
  if (!screenshot) throw new Error("Screenshot not found");
  const batch = getBatch(screenshot.batch_id);
  if (!batch) throw new Error("Batch not found");

  const controller = new AbortController();
  activeController = controller;
  const signal = controller.signal;

  const settings = getAppSettings();
  const ocrAmountCheckerEnabled = settings.ocr_amount_checker_enabled;
  const llmRunIso = new Date().toISOString();

  // Clear previous extraction
  clearScreenshotExtraction(screenshotId);

  // 1. Run LLM
  const extractionEngine = `openrouter:${settings.openrouter_model}|run:${llmRunIso}|single:true`;
  const extractionRun = startExtractionRun({
    batchId: screenshot.batch_id,
    screenshotId,
    extractionEngine
  });
  markScreenshotLlm(screenshotId, { status: "running", extractionEngine });

  try {
    const llmTask = (async (): Promise<LlmResult> => {
      try {
        const result = await extractWithOpenRouter({
          screenshot,
          sourceAppGuess: screenshot.source_app_guess,
          signal
        });
        if (!result) throw new Error("OpenRouter API key is required to extract orders.");

        const sourceAppGuess = sourceGuessFromLlm(result, screenshot.source_app_guess);
        const normalizedOrders = normalizeLlmOrders(result, sourceAppGuess, screenshotId);
        const aiCandidates = aiCandidatesFromOrders(normalizedOrders);
        const attentionReasons = attentionReasonsFromLlm(result);
        markScreenshotLlm(screenshotId, {
          status: "done",
          extractionEngine,
          usage: result.usage,
          costUsd: result.usage.costUsd
        });
        return { result, error: "", extractionEngine, normalizedOrders, aiCandidates, attentionReasons };
      } catch (error: any) {
        const message = stoppedError(error);
        markScreenshotLlm(screenshotId, { status: "failed", extractionEngine, error: message });
        return { result: null, error: message, extractionEngine, normalizedOrders: [], aiCandidates: [], attentionReasons: [] };
      }
    })();

    const ocrTask = (async (): Promise<OcrResult> => {
      if (!ocrAmountCheckerEnabled) {
        const skipped: OcrResult = { rows: [], error: "", sourceAppGuess: screenshot.source_app_guess, attentionReasons: [] };
        markScreenshotOcr(screenshotId, { status: "skipped", rows: [], sourceAppGuess: screenshot.source_app_guess });
        return skipped;
      }

      markScreenshotOcr(screenshotId, { status: "running" });
      try {
        const rows = await runOcrQueued(screenshot, signal);
        const sourceAppGuess = sourceGuessFromOcr(screenshot, rows);
        const done: OcrResult = { rows, error: "", sourceAppGuess, attentionReasons: attentionReasonsFromOcr(rows) };
        markScreenshotOcr(screenshotId, { status: "done", rows, sourceAppGuess });
        return done;
      } catch (error: any) {
        const message = stoppedError(error);
        const failed: OcrResult = { rows: [], error: message, sourceAppGuess: screenshot.source_app_guess, attentionReasons: [] };
        markScreenshotOcr(screenshotId, { status: "failed", rows: [], sourceAppGuess: screenshot.source_app_guess, error: message });
        return failed;
      }
    })();

    const [llm, ocr] = await Promise.all([llmTask, ocrTask]);

    if (signal.aborted) {
      markScreenshotProcessed(screenshotId, { error: "Processing stopped" });
      finishExtractionRun({ id: extractionRun.id, status: "stopped", error: "Processing stopped", ocrRows: ocr.rows });
      return getBatchSummary(screenshot.batch_id);
    }

    if (!llm.result) {
      markScreenshotProcessed(screenshotId, {
        error: llm.error || "LLM extraction failed",
        ocrRows: ocr.rows,
        sourceAppGuess: ocr.sourceAppGuess,
        extractionEngine: llm.extractionEngine
      });
      finishExtractionRun({ id: extractionRun.id, status: "failed", error: llm.error || "LLM extraction failed", ocrRows: ocr.rows });
      return getBatchSummary(screenshot.batch_id);
    }

    const attentionReasons = mergeReasons(llm.attentionReasons, ocr.attentionReasons);
    const amountCheck = !ocrAmountCheckerEnabled
      ? unavailableAmountCheck(llm.aiCandidates, ["ocr_amount_checker_disabled", "manual_check_required"])
      : ocr.error
        ? unavailableAmountCheck(llm.aiCandidates, ["amount_scan_unavailable", "manual_check_required"])
        : compareAmounts({
            aiCandidates: llm.aiCandidates,
            scannerCandidates: scanAmountCandidates(ocr.rows)
          });

    persistScreenshotOrders({
      batchId: screenshot.batch_id,
      screenshot,
      ocrRows: ocr.rows,
      ocrAvailable: ocrAmountCheckerEnabled && !ocr.error && ocr.rows.length > 0,
      sourceAppGuess: ocr.sourceAppGuess,
      normalizedOrders: llm.normalizedOrders,
      extractionEngine,
      extractionRunId: extractionRun.id,
      amountCheck,
      attentionReasons
    });
    finishExtractionRun({
      id: extractionRun.id,
      status: "done",
      llmResult: llm.result,
      ocrRows: ocr.rows,
      amountCheck
    });
  } catch (error: any) {
    const message = error?.message || "Processing failed";
    markScreenshotLlm(screenshotId, { status: "failed", extractionEngine, error: message });
    markScreenshotProcessed(screenshotId, {
      error: message,
      sourceAppGuess: screenshot.source_app_guess,
      extractionEngine
    });
    finishExtractionRun({ id: extractionRun.id, status: "failed", error: message });
  } finally {
    if (activeController === controller) activeController = null;
  }

  return getBatchSummary(screenshot.batch_id);
}
