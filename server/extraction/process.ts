import { compareAmounts, scanAmountCandidates } from "./amount-check";
import { extractWithOpenRouter } from "./openrouter";
import { guessSourceAppFromText, normalizeExtractedOrder, evidenceFromIds } from "../normalize";
import { runOcrQueued } from "../ocr/ocr-runner";
import { clearScreenshotExtraction, getAppSettings, getBatch, getBatchSummary, listScreenshots, markScreenshotProcessed, upsertOrder } from "../store";
import type { AmountCandidate, AmountCheckState, OcrRow, ReviewState } from "../types";

function reviewStateFromAmountCheck(state: AmountCheckState): ReviewState {
  return state === "matched" ? "ok" : "needs_check";
}

export async function processBatch(batchId: string, opts: { force?: boolean } = {}) {
  const batch = getBatch(batchId);
  if (!batch) throw new Error("Batch not found");

  const screenshots = listScreenshots(batchId).filter((shot) => opts.force || !shot.processed_at);
  for (const screenshot of screenshots) {
    try {
      clearScreenshotExtraction(screenshot.id);
      let rows: OcrRow[] = [];
      let ocrError = "";
      try {
        rows = await runOcrQueued(screenshot);
      } catch (error: any) {
        ocrError = error?.message || "OCR failed";
      }
      const allText = rows.map((row) => row.text).join("\n");
      const guessed = guessSourceAppFromText(allText);
      const sourceAppGuess = guessed === "unknown" ? screenshot.source_app_guess : guessed;
      const llmResult = await extractWithOpenRouter({ screenshot, ocrRows: rows, sourceAppGuess });
      if (!llmResult) {
        throw new Error("OpenRouter API key is required to extract orders. OCR can scan amounts, but it cannot create order rows by itself.");
      }
      const extractionEngine = `openrouter:${getAppSettings().openrouter_model}`;
      const normalizedOrders = llmResult.orders
        .map((order) => ({
          raw: order,
          normalized: normalizeExtractedOrder(order, {
            month: batch.month,
            sourceApp: order.sourceApp ?? llmResult.sourceApp ?? sourceAppGuess
          })
        }))
        .filter(({ normalized }) => normalized.restaurantName || normalized.totalAmount > 0);
      const aiCandidates: AmountCandidate[] = normalizedOrders
        .filter(({ normalized }) => normalized.totalAmount > 0)
        .map(({ normalized }) => ({ amount: normalized.totalAmount, text: normalized.restaurantName || "AI amount" }));

      const amountCheck = compareAmounts({
        aiCandidates,
        scannerCandidates: ocrError ? [] : scanAmountCandidates(rows)
      });
      if (ocrError) {
        amountCheck.state = "unavailable";
        if (!amountCheck.reasons.includes("amount_scan_unavailable")) {
          amountCheck.reasons.push("amount_scan_unavailable");
        }
      }

      const reviewState = reviewStateFromAmountCheck(amountCheck.state);
      let extractedOrderCount = 0;

      for (const { raw, normalized } of normalizedOrders) {
        const evidence = {
          ...evidenceFromIds(raw.evidence, rows, screenshot.id),
          amountCheck: {
            state: amountCheck.state,
            reasons: amountCheck.reasons,
            aiAmounts: amountCheck.aiAmounts,
            scannerAmounts: amountCheck.scannerAmounts
          }
        };
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
          evidence
        });
        extractedOrderCount += 1;
      }

      markScreenshotProcessed(screenshot.id, {
        error: "",
        ocrRows: rows,
        sourceAppGuess,
        extractedOrderCount,
        extractionEngine,
        amountCheck
      });
    } catch (error: any) {
      markScreenshotProcessed(screenshot.id, { error: error?.message || "Processing failed" });
    }
  }

  return getBatchSummary(batchId);
}
