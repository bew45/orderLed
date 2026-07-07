export type SourceApp = "grab" | "lineman" | "shopeefood" | "unknown";
export type OrderStatus = "completed" | "cancelled" | "refunded" | "unknown";
export type ReviewState = "ok" | "needs_review" | "corrected";

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
  confidence: number;
  review_state: ReviewState;
  duplicate_key: string;
  source_screenshot_ids_json: string;
  evidence_json: string;
  created_at: number;
  updated_at: number;
};

export type ExtractedOrder = {
  sourceApp?: SourceApp;
  orderedAt?: string;
  restaurantName?: string;
  totalAmount?: number;
  status?: OrderStatus;
  refundAmount?: number;
  itemsText?: string;
  confidence?: number;
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
