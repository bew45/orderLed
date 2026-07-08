export type SourceApp = "grab" | "lineman" | "shopeefood" | "unknown";
export type OrderStatus = "completed" | "cancelled" | "refunded" | "unknown";
export type ReviewState = "ok" | "needs_check" | "corrected";
export type AmountCheckState = "not_checked" | "matched" | "mismatch" | "unavailable";
export type ProcessingStepStatus = "not_started" | "queued" | "running" | "done" | "failed" | "skipped";

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OcrRow = {
  id: string;
  text: string;
  confidence: number;
  bbox: Rect;
};

export type AmountCandidate = {
  amount: number;
  text: string;
  rowId?: string;
  bbox?: Rect;
};

export type AmountCheck = {
  state: AmountCheckState;
  aiAmounts: number[];
  scannerAmounts: number[];
  missingFromAi: number[];
  missingFromScanner: number[];
  sumAi: number;
  sumScanner: number;
  reasons: string[];
  aiCandidates: AmountCandidate[];
  scannerCandidates: AmountCandidate[];
};

export type Batch = {
  id: string;
  title: string;
  month: string;
  created_at: number;
  updated_at: number;
};

export type Screenshot = {
  id: string;
  batch_id: string;
  original_name: string;
  storage_path: string;
  content_hash: string;
  source_app_guess: SourceApp;
  width: number;
  height: number;
  ocr_text_json: string;
  ocr_line_count: number;
  extracted_order_count: number;
  extraction_engine: string;
  amount_check_state: AmountCheckState;
  amount_check_json: string;
  ocr_status: ProcessingStepStatus;
  ocr_error: string;
  ocr_completed_at: number;
  llm_status: ProcessingStepStatus;
  llm_error: string;
  llm_completed_at: number;
  processed_at: number;
  error: string;
  created_at: number;
  updated_at: number;
};

export type OrderRow = {
  id: string;
  batch_id: string;
  source_app: SourceApp;
  ordered_at: string;
  restaurant_name: string;
  total_amount: number;
  status: OrderStatus;
  refund_amount: number;
  net_amount: number;
  items_text: string;
  review_state: ReviewState;
  duplicate_key: string;
  source_screenshot_ids_json: string;
  evidence_json: string;
  created_at: number;
  updated_at: number;
};

export type ExtractedOrder = {
  screenOrder?: number;
  sourceApp?: SourceApp;
  orderedAt?: string;
  restaurantName?: string;
  totalAmount?: number;
  status?: OrderStatus;
  refundAmount?: number;
  itemsText?: string;
  evidence?: Record<string, string[]>;
};

export type BatchSummary = {
  batchId: string;
  screenshotsTotal: number;
  screenshotsProcessed: number;
  screenshotsFailed: number;
  ordersTotal: number;
  ordersNeedingReview: number;
  netSpend: number;
  completedSpend: number;
  refundedOrCancelled: number;
};

export type AppSettings = {
  openrouter_api_key: string;
  openrouter_model: string;
  openrouter_base_url: string;
  paddle_python: string;
  paddle_lang: string;
  paddle_timeout_ms: number;
  ocr_amount_checker_enabled: boolean;
  favorite_models: string[];
  promptpay_qr_enabled: boolean;
  promptpay_amount_locked: boolean;
  promptpay_id: string;
  promptpay_recipient_name: string;
};
