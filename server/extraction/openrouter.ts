import { readFileSync } from "fs";
import { readStoredImage } from "../image-store";
import { parseJson } from "../json";
import type { ExtractedOrder, OcrRow, Screenshot, SourceApp } from "../types";

type ExtractionResult = {
  sourceApp: SourceApp;
  orders: ExtractedOrder[];
};

function baseUrl() {
  return (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
}

function model() {
  return process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";
}

function imageDataUrl(screenshot: Screenshot) {
  const path = readStoredImage(screenshot.storage_path);
  const buffer = readFileSync(path);
  const ext = path.toLowerCase().endsWith(".png") ? "png" : path.toLowerCase().endsWith(".webp") ? "webp" : "jpeg";
  return `data:image/${ext};base64,${buffer.toString("base64")}`;
}

function extractJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(candidate.slice(first, last + 1));
    throw new Error("Extractor returned non-JSON text");
  }
}

export async function extractWithOpenRouter(input: {
  screenshot: Screenshot;
  ocrRows: OcrRow[];
  sourceAppGuess: SourceApp;
}): Promise<ExtractionResult | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const compactRows = input.ocrRows.map((row) => ({
    id: row.id,
    t: row.text,
    c: Number(row.confidence.toFixed(3)),
    b: [
      Number(row.bbox.x.toFixed(3)),
      Number(row.bbox.y.toFixed(3)),
      Number(row.bbox.w.toFixed(3)),
      Number(row.bbox.h.toFixed(3))
    ]
  }));

  const prompt = [
    "You extract food delivery order history cards from mobile screenshots.",
    "Return JSON only. Do not explain.",
    "",
    "Supported apps: grab, lineman, shopeefood, unknown.",
    "Each visible order card should become one order.",
    "Ignore navigation, battery banners, tabs, reorder buttons, ratings, and decorative text.",
    "Detect completed, cancelled, refunded, or unknown status.",
    "For cancelled/refunded Thai text, watch for: คำสั่งซื้อถูกยกเลิกแล้ว, คืนเงิน, ยกเลิก.",
    "Use OCR rows as anchors, but trust the image if OCR is noisy.",
    "If OCR rows are empty, read the screenshot directly from the image.",
    "If a value is unclear, return it blank/0 and lower confidence. Never invent.",
    "",
    "Schema:",
    JSON.stringify({
      sourceApp: "grab|lineman|shopeefood|unknown",
      orders: [{
        orderedAt: "ISO datetime if possible, otherwise visible date text",
        restaurantName: "string",
        totalAmount: 0,
        status: "completed|cancelled|refunded|unknown",
        refundAmount: 0,
        itemsText: "short readable item names if visible",
        confidence: 0.0,
        evidence: {
          restaurant: ["ocr_0001"],
          date: ["ocr_0002"],
          amount: ["ocr_0003"],
          status: ["ocr_0004"]
        }
      }]
    }),
    "",
    `sourceAppGuess=${input.sourceAppGuess}`,
    "OCR rows:",
    JSON.stringify(compactRows)
  ].join("\n");

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "http://localhost:5174",
      "X-Title": "OrderLedger"
    },
    body: JSON.stringify({
      model: model(),
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl(input.screenshot) } }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter extraction failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const payload = await response.json() as any;
  const rawText = String(payload?.choices?.[0]?.message?.content ?? "");
  const parsed = extractJson(rawText);
  return {
    sourceApp: parseJson<SourceApp>(JSON.stringify(parsed.sourceApp), "unknown"),
    orders: Array.isArray(parsed.orders) ? parsed.orders : []
  };
}
