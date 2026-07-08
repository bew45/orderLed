import { readFileSync } from "fs";
import { readStoredImage } from "../image-store";
import { parseJson } from "../json";
import { getAppSettings } from "../store";
import type { ExtractedOrder, Screenshot, SourceApp } from "../types";

type ExtractionResult = {
  sourceApp: SourceApp;
  orders: ExtractedOrder[];
};

function baseUrl() {
  return (getAppSettings().openrouter_base_url || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
}

function model() {
  return getAppSettings().openrouter_model || "google/gemini-2.5-flash-lite";
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
  sourceAppGuess: SourceApp;
  signal?: AbortSignal;
}): Promise<ExtractionResult | null> {
  const key = getAppSettings().openrouter_api_key;
  if (!key) return null;

  const prompt = [
    "You extract food delivery order history cards from mobile screenshots.",
    "Return JSON only. Do not explain.",
    "",
    "Supported apps: grab, lineman, shopeefood, unknown.",
    "App identification cues, check these before guessing:",
    "- grab: header text \"Activity History\"; filter chips are solid stadium pills (dark green when selected, mint green when not) labelled things like Transport/Food/Mart/Dine Out/Finance; order rows may show \"+N GrabCoins\"; app-wide accent color is green.",
    "- lineman: header text \"Order History\"; three tabs Ongoing / Completed / Canceled or Failed with a green underline on the active tab; filter chips are outlined (not filled) pills labelled Food Delivery/Mart/Messenger/Ride; green \"Order completed\" status text; app-wide accent color is green.",
    "- shopeefood: app-wide accent color is orange/red (buttons, active tab underline, icons all orange); Thai header \"คำสั่งซื้อของฉัน\"; two tabs \"คำสั่งซื้ออาหาร\" / \"ดีลล็อกราคา\"; status text \"จัดส่งสำเร็จแล้ว\"; orange button \"สั่งใหม่\".",
    "If the screenshot is mostly orange/red, it is shopeefood. If green, use the header text and tab labels above to tell grab and lineman apart. Only return unknown if truly no cues match.",
    "Each visible order card should become one order.",
    "Ignore navigation, battery banners, tabs, reorder buttons, ratings, and decorative text.",
    "Detect completed, cancelled, refunded, or unknown status.",
    "For cancelled/refunded Thai text, watch for: คำสั่งซื้อถูกยกเลิกแล้ว, คืนเงิน, ยกเลิก.",
    "Read directly from the image. No OCR text or OCR boxes are provided.",
    "If a value is unclear, return it blank/0. Never invent.",
    "List the orders array in the exact same top-to-bottom order the order cards appear on the screen, topmost card first.",
    "Every order MUST include screenOrder: 1 for the top visible order card, 2 for the next card, 3 for the next, and so on.",
    "Do not sort by date, time, restaurant name, or amount. Preserve the visual screen order only.",
    "If two cards look similar, still number them by their vertical position on the screenshot.",
    "",
    "Schema:",
    JSON.stringify({
      sourceApp: "grab|lineman|shopeefood|unknown",
      orders: [{
        screenOrder: 1,
        orderedAt: "ISO datetime if possible, otherwise visible date text",
        restaurantName: "string",
        totalAmount: 0,
        status: "completed|cancelled|refunded|unknown",
        refundAmount: 0,
        itemsText: "short readable item names if visible"
      }]
    }),
    "",
    `sourceAppGuess=${input.sourceAppGuess}`
  ].join("\n");

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    signal: input.signal,
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
