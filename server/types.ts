export type SourceApp = "grab" | "lineman" | "shopeefood" | "unknown";
export type OrderStatus = "completed" | "cancelled" | "refunded" | "unknown";
export type ReviewState = "ok" | "needs_check" | "corrected";
/** How much of the order date we could actually read (see docs/REDESIGN_PLAN.md §3). */
export type DatePrecision = "full" | "month" | "none";
/** Per-order review tier. Replaces the binary per-screenshot review (bug B1/B15). */
export type ReviewTier = "clean" | "review" | "blocked";
export type OrderFlag = {
  code: string;
  field: string;
  severity: "info" | "warn" | "block";
  detail?: string;
};
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
  llm_usage_json: string;
  llm_cost_usd: number;
  processed_at: number;
  error: string;
  created_at: number;
  updated_at: number;
};

export type OrderRow = {
  id: string;
  /** "First seen in" batch tag only — NOT ownership. Provenance is in order_observations. */
  batch_id: string;
  source_app: SourceApp;
  /** "" | "YYYY-MM" | "YYYY-MM-DDTHH:MM:SS" — pair with date_precision. */
  ordered_at: string;
  date_precision: DatePrecision;
  restaurant_name: string;
  branch: string;
  total_amount: number;
  status: OrderStatus;
  refund_amount: number;
  net_amount: number;
  item_count: number;
  currency: string;
  items_text: string;
  /** 0..1 weighted confidence (amount .45 / status .2 / date .2 / restaurant .1 / app .05). */
  confidence: number;
  review_tier: ReviewTier;
  /** Kept in sync with review_tier for backward-compatible UI until Phase 2. */
  review_state: ReviewState;
  /** JSON string of OrderFlag[] — the specific reasons a row is review/blocked. */
  flags_json: string;
  /** 1 once a person has confirmed, corrected, or manually added this row. */
  user_edited: 0 | 1;
  duplicate_key: string;
  source_screenshot_ids_json: string;
  evidence_json: string;
  created_at: number;
  updated_at: number;
};

/** Raw shape returned by the vision model per card (see docs/REDESIGN_PLAN.md §2.6). */
export type ExtractedOrder = {
  screenOrder?: number;
  sourceApp?: SourceApp;
  /** ISO datetime if the model produced one. */
  orderedAt?: string;
  /** Verbatim on-screen date/time string — preferred input for the date parser. */
  orderedAtText?: string;
  restaurantName?: string;
  branch?: string;
  totalAmount?: number;
  /** Verbatim on-screen amount string incl. currency — used to cross-check against OCR. */
  totalAmountText?: string;
  status?: OrderStatus;
  refundAmount?: number;
  itemCount?: number;
  itemsText?: string;
  /** true when the card is clipped by the top/bottom screen edge. */
  partial?: boolean;
};

export type BatchSummary = {
  batchId: string;
  screenshotsTotal: number;
  screenshotsProcessed: number;
  screenshotsFailed: number;
  ordersTotal: number;
  /** review_tier !== 'clean' (review + blocked). */
  ordersNeedingReview: number;
  /** review_tier === 'blocked' only — the count shown on the dashboard, never a baht figure. */
  ordersBlocked: number;
  /** Σ net_amount over confirmed rows (clean + review); blocked rows contribute 0. */
  netSpend: number;
  /** Σ total_amount over confirmed completed rows. */
  completedSpend: number;
  /** Σ total_amount over confirmed rows (any status). */
  grossSpend: number;
  /** grossSpend − netSpend — money that was cancelled or refunded (bug B9). */
  refundedOrCancelled: number;
};

export type RestaurantTally = { name: string; count: number; spend: number };

/** One accounting period in the ledger dashboard (see docs/REDESIGN_PLAN.md §4.3 / §5). */
export type MonthBucket = {
  /** "YYYY-MM" or "unknown" */
  month: string;
  orderCount: number;
  netSpend: number;
  completedSpend: number;
  grossSpend: number;
  refundedOrCancelled: number;
  reviewCount: number;
  byAppSpend: Record<SourceApp, number>;
  byAppCount: Record<SourceApp, number>;
  topRestaurants: RestaurantTally[];
  firstDate: string;
  lastDate: string;
};

export type LedgerDashboard = {
  /** Σ net over confirmed rows (clean + review). Blocked rows never contribute (D4). */
  confirmedNet: number;
  grossSpend: number;
  refundedOrCancelled: number;
  /** confirmed order count */
  orderCount: number;
  /** review_tier === 'blocked' — shown only as a count, never a baht figure */
  blockedCount: number;
  restaurantCount: number;
  /** number of real months covered (excludes the "unknown" bucket) */
  monthCount: number;
  byAppSpend: Record<SourceApp, number>;
  /** newest month first; the "unknown" bucket, if any, is always last */
  months: MonthBucket[];
};

/** "What did this import contribute to the ledger" (see docs/REDESIGN_PLAN.md §5 step 3). */
export type BatchRollup = {
  batchId: string;
  screenshotsTotal: number;
  screenshotsProcessed: number;
  screenshotsFailed: number;
  /** rows first seen in this batch */
  newOrders: number;
  /** rows this batch re-observed but that another batch owns */
  mergedOrders: number;
  reviewCount: number;
  blockedCount: number;
  /** Σ net over confirmed rows this batch touched */
  netPosted: number;
  /** distinct "YYYY-MM" (and/or "unknown") this batch's orders fall in, sorted */
  periods: string[];
};

export type AppSettings = {
  openrouter_api_key: string;
  openrouter_model: string;
  openrouter_base_url: string;
  paddle_python: string;
  paddle_lang: string;
  paddle_device: string;
  paddle_timeout_ms: number;
  ocr_amount_checker_enabled: boolean;
  favorite_models: string[];
  promptpay_qr_enabled: boolean;
  promptpay_amount_locked: boolean;
  promptpay_id: string;
  promptpay_recipient_name: string;
  pdf_style: PdfStyle;
};

export type PdfStyle = "midnight" | "minimal" | "audit";
