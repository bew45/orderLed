import { readFileSync } from "fs";
import { readStoredImage } from "../image-store";
import { parseJson } from "../json";
import { getAppSettings } from "../store";
import type { ExtractedOrder, Screenshot, SourceApp } from "../types";

type ExtractionResult = {
  sourceApp: SourceApp;
  orders: ExtractedOrder[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number };
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

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Coerce the model's per-order objects into ExtractedOrder shape; never drop a card. */
function sanitizeOrders(value: unknown): ExtractedOrder[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index): ExtractedOrder => {
    const order = (raw ?? {}) as Record<string, unknown>;
    const screenOrder = Number(order.screenOrder);
    return {
      screenOrder: Number.isInteger(screenOrder) && screenOrder > 0 ? screenOrder : index + 1,
      orderedAt: str(order.orderedAt) || undefined,
      orderedAtText: str(order.orderedAtText) || undefined,
      restaurantName: str(order.restaurantName),
      branch: str(order.branch),
      totalAmount: num(order.totalAmount),
      totalAmountText: str(order.totalAmountText) || undefined,
      status: str(order.status) as ExtractedOrder["status"],
      refundAmount: num(order.refundAmount),
      itemCount: Math.max(0, Math.round(num(order.itemCount))),
      itemsText: str(order.itemsText),
      partial: order.partial === true
    };
  });
}

export async function extractWithOpenRouter(input: {
  screenshot: Screenshot;
  sourceAppGuess: SourceApp;
  signal?: AbortSignal;
}): Promise<ExtractionResult | null> {
  const key = getAppSettings().openrouter_api_key;
  if (!key) return null;

  const referenceDate = new Date(input.screenshot.created_at || Date.now()).toISOString().slice(0, 10);
  const prompt = [
    "You extract food delivery order history cards from mobile screenshots.",
    "Return JSON only. Do not explain.",
    "",
    "Supported apps: grab, lineman, shopeefood, unknown.",
    "App identification cues, check these before guessing:",
    "- grab: header text \"Activity History\"; filter chips are solid stadium pills (dark green when selected, mint green when not) labelled things like Transport/Food/Mart/Dine Out/Finance; order rows may show \"+N GrabCoins\"; app-wide accent color is green.",
    "- lineman: header text \"Order History\"; three tabs Ongoing / Completed / Canceled or Failed with a green underline on the active tab; filter chips are outlined (not filled) pills labelled Food Delivery/Mart/Messenger/Ride; green \"Order completed\" status text; app-wide accent color is green.",
    "- shopeefood: app-wide accent color is orange/red (buttons, active tab underline, icons all orange); Thai header \"คำสั่งซื้อของฉัน\"; two tabs \"คำสั่งซื้ออาหาร\" / \"ดีลล็อกราคา\"; status text \"จัดส่งสำเร็จแล้ว\"; orange button \"สั่งใหม่\".",
    "- If the whole order-history page is Thai-only with no visible English app/navigation labels, prefer shopeefood over unknown.",
    "If the screenshot is mostly orange/red, it is shopeefood. If green, use the header text and tab labels above to tell grab and lineman apart. Only return unknown if truly no cues match.",
    "",
    "Each visible FOOD order card becomes one order. Only read the order-history list.",
    "Skip cards that belong to a non-history tab: shopeefood \"ดีลล็อกราคา\" (price-lock deals), lineman \"Ongoing\". If the active tab is not the completed/past-orders list, return an empty orders array.",
    "Ignore navigation, battery banners, tabs, reorder buttons, ratings, GrabCoins, and decorative text.",
    "restaurantName is the shop name on its own line. On lineman the small line below it (e.g. a saved-address nickname like \"New xs x\" possibly with an emoji) is the USER'S DELIVERY ADDRESS — never put it in restaurantName or branch.",
    "branch: the branch / outlet text if the shop name includes one (often after \" - \"), else \"\".",
    "Detect completed, cancelled, refunded, or unknown status. For cancelled/refunded Thai text watch for: คำสั่งซื้อถูกยกเลิกแล้ว, คืนเงิน, ยกเลิก.",
    "orderedAtText: copy the date/time string EXACTLY as shown, verbatim (Thai or English, with or without a time). Do not reformat, do not convert the year, do not resolve relative words.",
    `The screenshot was captured around ${referenceDate}; an order date can be this day or earlier, never in the future.`,
    "totalAmountText: the amount string exactly as shown including the currency mark and decimals (e.g. \"฿216.00\"). totalAmount: the same value as a plain number. If no amount is visible, use \"\" and 0.",
    "itemCount: the number of items if the card shows one (e.g. shopeefood \"3 รายการ\"), else 0.",
    "partial: true if the card is clipped by the top or bottom edge of the screen so some of its data is cut off.",
    "If a value is unclear, return it blank/0/false. Never invent.",
    "List orders in exact top-to-bottom screen order. Every order MUST include screenOrder: 1 for the topmost card, 2 for the next, and so on — number by vertical position even if two cards look identical. Do not sort by date/amount/name.",
    "",
    "Schema:",
    JSON.stringify({
      sourceApp: "grab|lineman|shopeefood|unknown",
      orders: [{
        screenOrder: 1,
        orderedAtText: "date/time string exactly as shown",
        restaurantName: "string",
        branch: "string",
        totalAmountText: "amount string as shown",
        totalAmount: 0,
        status: "completed|cancelled|refunded|unknown",
        refundAmount: 0,
        itemCount: 0,
        itemsText: "short readable item names if visible",
        partial: false
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
    orders: sanitizeOrders(parsed.orders),
    usage: {
      promptTokens: Number(payload?.usage?.prompt_tokens ?? 0) || 0,
      completionTokens: Number(payload?.usage?.completion_tokens ?? 0) || 0,
      totalTokens: Number(payload?.usage?.total_tokens ?? 0) || 0,
      costUsd: Number(payload?.usage?.cost ?? payload?.cost ?? 0) || 0
    }
  };
}
