import { extractWithHeuristics } from "./heuristics";
import { extractWithOpenRouter } from "./openrouter";
import { guessSourceAppFromText, normalizeExtractedOrder, evidenceFromIds } from "../normalize";
import { runOcrQueued } from "../ocr/ocr-runner";
import { clearScreenshotExtraction, getAppSettings, getBatch, getBatchSummary, listScreenshots, markScreenshotProcessed, upsertOrder } from "../store";
import type { OcrRow } from "../types";

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
      if (!llmResult && ocrError) throw new Error(`${ocrError}. Add OPENROUTER_API_KEY to use vision extraction without OCR.`);
      const result = llmResult ?? extractWithHeuristics(rows, sourceAppGuess);
      const extractionEngine = llmResult ? `openrouter:${getAppSettings().openrouter_model}` : "heuristics";
      let extractedOrderCount = 0;

      for (const order of result.orders) {
        const normalized = normalizeExtractedOrder(order, {
          month: batch.month,
          sourceApp: order.sourceApp ?? result.sourceApp ?? sourceAppGuess
        });
        if (!normalized.restaurantName && normalized.totalAmount <= 0) continue;
        const evidence = evidenceFromIds(order.evidence, rows, screenshot.id);
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
          confidence: normalized.confidence,
          reviewState: normalized.reviewState,
          duplicateKey: normalized.duplicateKey,
          sourceScreenshotId: screenshot.id,
          evidence
        });
        extractedOrderCount += 1;
      }

      markScreenshotProcessed(screenshot.id, {
        error: ocrError && !llmResult ? ocrError : "",
        ocrRows: rows,
        sourceAppGuess,
        extractedOrderCount,
        extractionEngine
      });
    } catch (error: any) {
      markScreenshotProcessed(screenshot.id, { error: error?.message || "Processing failed" });
    }
  }

  return getBatchSummary(batchId);
}
