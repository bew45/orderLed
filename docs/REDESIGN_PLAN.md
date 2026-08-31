# OrderLedger — System Redesign Plan

> Living document. Update the checklists as work lands. Do not delete bug entries —
> mark them `[x]` with the commit/date so we keep the trail.
>
> Last audited: 2026-08-31 (full read of server/ + src/ extraction, store, export, screens).

---

## 0. เป้าหมาย (Thai summary)

- ระบบเป็น **บัญชีแยกประเภทเดียวของทั้งระบบ (general ledger)** ไม่ใช่ dashboard ต่อ batch
- อัปสกรีนช็อต LINE MAN / ShopeeFood / Grab → อ่านทุกการ์ดเป็น "ออร์เดอร์" → **โพสต์เข้า ledger รวม**
- `batch` = แค่แท็ก + audit trail (รอบการ import ครั้งหนึ่ง)
- Dashboard = อ่าน ledger ทั้งหมด **group ตามเดือนของ `ordered_at`**
- Review ใหม่: **ต่อออร์เดอร์ + มีระดับ** (`clean` / `review` / `blocked`) — เลิก binary ต่อสกรีนช็อต
- ไม่ทิ้งข้อมูล: อ่านอะไรไม่ได้ก็ลง ledger แล้ว `blocked` ให้คนตรวจ
- ยอด **Confirmed** กับ **Pending** แยกกันบน dashboard

---

## 1. Architecture — 3 layers

```
RAW LAYER  (immutable, keep everything, never merged)
  extraction_runs      1 row / screenshot / read-pass   (llm raw, ocr raw, amount-check raw)
  order_observations   1 row / visible card / read      (raw_json, normalized_json, flags)
                       every row carries screenshot_id + batch_id + order_id(-> ledger)
  field_evidence       per-field provenance (vision | ocr | rule | human)
  order_corrections    before/after on every human edit

LEDGER  (orders — system of record, global, NOT batch-scoped)
  deduplicated + merged across ALL batches
  human-editable; edits tracked in order_corrections
  this is the ONLY thing dashboards / exports read

REPORT  (computed, no tables)
  MonthBucket[]   group by ordered_at[0:7]  (+ "unknown" bucket)
  LedgerTotals    confirmedNet / pendingNet / grossByApp / topRestaurants
  BatchRollup     JOIN order_observations on batch_id  ("what did this import add")
```

**Keep** the RAW tables — they already exist and are good. The redesign is about the LEDGER
write path and the REPORT layer, plus killing the binary review model.

---

## 2. LLM contract (audited — this is what we actually get today)

### 2.1 Request (`server/extraction/openrouter.ts`)

- `model`: from settings, default `google/gemini-2.5-flash-lite`
- `temperature: 0`
- `response_format: { type: "json_object" }`
- one user message: `[{type:text, text: prompt}, {type:image_url, image_url:{url: dataURL}}]`
- image sent as base64 data URL (`data:image/jpeg;base64,...`)
- **no OCR text is sent to the model** (prompt line: "No OCR text or OCR boxes are provided")

### 2.2 Prompt asks for exactly this JSON

```json
{
  "sourceApp": "grab|lineman|shopeefood|unknown",
  "orders": [
    {
      "screenOrder": 1,
      "orderedAt": "ISO datetime if possible, otherwise visible date text",
      "restaurantName": "string",
      "totalAmount": 0,
      "status": "completed|cancelled|refunded|unknown",
      "refundAmount": 0,
      "itemsText": "short readable item names if visible"
    }
  ]
}
```

- prompt rules: one order per visible card; number cards top→bottom by `screenOrder`;
  ignore nav / battery / tabs / reorder buttons / ratings; unclear value → blank/0, never invent
- app-identification cues for grab/lineman/shopeefood are spelled out (colors, header text, tabs)

### 2.3 Response parsing

- read `payload.choices[0].message.content` (string)
- `extractJson()`: strip ```json fences → `JSON.parse` → fallback: slice first `{` … last `}`
- return `{ sourceApp: parsed.sourceApp ?? "unknown", orders: Array.isArray(parsed.orders) ? parsed.orders : [], usage }`
- `usage.costUsd` from `payload.usage.cost`
- **NO per-order schema validation** — raw keys flow straight into `normalizeExtractedOrder`

### 2.4 What normalize does with it (`server/normalize.ts`)

- `orderedAt`: regex-parse ISO / `1 Jun 2026, 11:12` / `30 ส.ค. 2026`; BE year (≥2400) −543; 2-digit year → 20xx; no time → time 00:00; unparseable → **fallback `batch.month`-01** (BUG B6)
- `status`: keyword map incl. Thai (คืนเงิน / ยกเลิก / สำเร็จ)
- `totalAmount` / `refundAmount`: `amount()` — strips ฿/THB/commas, accepts integer
- `netAmount`: cancelled→0, refunded→total−refund, else total
- builds `duplicateKey = app | orderedAt[0:16] | restaurant(normalized) | total.toFixed(2)`
  (weak identity → `unresolved|...` key, never merged)

### 2.5 Contract gaps for the redesign

| ID | Gap |
|----|-----|
| B16 | `orderedAt` is free text or ISO; model is **not told the screenshot's reference date** → cannot resolve relative dates, cannot sanity-check the year |
| B17 | model returns a parsed number `totalAmount`; the **on-screen string** ("฿216.00") is discarded → weakens amount-verify against OCR |
| B18 | no `itemCount`, `branch`, `discount`, `deliveryFee` in the contract |
| B19 | `ExtractedOrder.evidence` + `evidenceFromIds()` are **dead** (prompt no longer supplies OCR rows) |
| B20 | no "partial card cut off at top/bottom" signal requested |
| B21 | `screenOrder` collisions (model repeats `1`) fall back to array index → fragile position tracking (`process.ts normalizeLlmOrders`) |

### 2.6 Target contract (v2)

```json
{
  "sourceApp": "grab|lineman|shopeefood|unknown",
  "captureHintsSeen": ["relative_date_text", "cut_off_top", "cut_off_bottom"],
  "orders": [
    {
      "screenOrder": 1,
      "orderedAtText": "exact date/time string as shown, verbatim",
      "restaurantName": "primary line only, NOT the delivery-address label",
      "branch": "branch/'- สาขา' text if present, else ''",
      "totalAmountText": "amount string as shown incl. ฿ and decimals",
      "totalAmount": 0,
      "status": "completed|cancelled|refunded|unknown",
      "refundAmount": 0,
      "itemCount": 0,
      "itemsText": "",
      "partial": false
    }
  ]
}
```

- keep `response_format: json_object`, `temperature: 0`
- send a `referenceDate` in the prompt = screenshot upload date, so year/relative dates can be checked
- prompt: LINE MAN — the `New🌙 xs x` style line is the **user's saved address**, never the restaurant
- prompt: skip cards from non-history tabs (Shopee `ดีลล็อกราคา`, LINE MAN `Ongoing`)
- prompt: set `partial: true` when a card is clipped by the screen edge
- keep `*Text` raw strings for cross-checking; keep parsed numbers for math
- still validate every order server-side; a missing/garbage field → record it, flag it, never drop it

---

## 3. LEDGER schema (target `orders`)

```
id                TEXT PK
source_app        'grab'|'lineman'|'shopeefood'|'unknown'
ordered_at        TEXT   ''  | 'YYYY-MM' | 'YYYY-MM-DDTHH:MM:SS'
date_precision    'full' | 'month' | 'none'
restaurant_name   TEXT
branch            TEXT
total_amount      REAL
refund_amount     REAL
net_amount        REAL
status            'completed'|'cancelled'|'refunded'|'unknown'
item_count        INTEGER DEFAULT 0
currency          TEXT DEFAULT 'THB'
confidence        REAL   0..1
review_tier       'clean' | 'review' | 'blocked'
flags_json        TEXT   '[{code,field,severity,detail}]'
user_edited       0 | 1
duplicate_key     TEXT   UNIQUE (except keys starting 'unresolved|' / 'manual|')
first_batch_id    TEXT   (tag only — NOT a cascading FK)
source_screenshot_ids_json TEXT
created_at, updated_at INTEGER
```

Changes vs today:
- **drop** `FOREIGN KEY(batch_id) REFERENCES batches(id) ON DELETE CASCADE`
- **replace** `UNIQUE(batch_id, duplicate_key)` → `UNIQUE(duplicate_key)` (partial: skip `unresolved|`,`manual|`)
- **add** `date_precision, branch, item_count, currency, confidence, review_tier, flags_json, first_batch_id`
- **rename intent** `batch_id` → `first_batch_id` (provenance now lives in `order_observations`)
- migration: rebuild table, copy rows, backup `data/orderledger.db` first

---

## 4. Confidence + review tier model (replaces binary per-screenshot review)

### 4.1 Per-order signals (computed after a screenshot's orders are all normalized)

```
amount_signal:
  verified  = this card's amount string appears in OCR text within the card's y-band
              OR  Σ(AI totals on screenshot) == Σ(OCR price scan on screenshot)   [booster only]
  weak      = OCR unavailable / amount not found near the card
  missing   = model returned no amount
date_signal:       full | month_only | missing
status_signal:     known | unknown
restaurant_signal: present | blank
app_signal:        known | unknown
dup_signal:        none | exact (auto-merge, silent) | conflict (same key, different amount/status)
partial_signal:    ok | partial (model flagged a clipped card)
```

### 4.2 Tier

```
blocked  ⟸  amount_signal == missing            (no number at all — do NOT show as money)
          ∨  dup_signal == conflict
          ∨  partial_signal == partial
          ∨  (weak count ≥ 2 among {amount_weak, date, status, restaurant, app})
review   ⟸  amount_signal == weak               (number present, OCR could not confirm)
          ∨  exactly one weak among {date, status, restaurant, app}
              e.g. date=month_only but amount present
clean    ⟸  everything else
```

Rationale (D4): a `blocked` order's number is untrustworthy, so it must never appear
as a baht figure anywhere. `weak` (number present but unverified) is still usable → `review`.

```
confidence = 0.45*amount + 0.20*status + 0.20*date + 0.10*restaurant + 0.05*app
  amount:  verified 1.0 | weak 0.4 | missing 0.0
  date:    full 1.0 | month_only 0.6 | missing 0.0
  status:  known 1.0 | unknown 0.3
  restaurant: present 1.0 | blank 0.0
  app:     known 1.0 | unknown 0.4
```

### 4.3 Behaviour

| tier | in ledger? | in any baht total / month card? | UI |
|------|-----------|-------------------------------|----|
| `clean` | yes | yes | normal row |
| `review` | yes | yes | reason chip ("ไม่ระบุวัน", "OCR ยืนยันยอดไม่ได้", "เดือนจากรายการข้างเคียง") |
| `blocked` | yes | **NO — never shown as money anywhere** | appears only as a count ("⚠ N รายการอ่านไม่ชัด") + CheckFlow queue |

- user confirms/edits in CheckFlow → `review_tier='clean'`, `user_edited=1`, `order_corrections` row
- merge rule (implemented): same strong key → silent merge (append observation); an
  extra screenshot never escalates tier to `blocked` (bug B5); two identical-looking
  cards on ONE screenshot stay separate rows via a `#<shot>:<screenOrder>` key suffix (bug B11).
  **Deferred to Phase 3:** cross-screenshot `dup_conflict` detection (`assessOrder` already
  accepts the signal; the process path passes `null` for now).
- `user_edited=1` rows are never overwritten by a re-read; the new observation is kept for comparison

---

## 5. Full pipeline (upload → PDF)

```
0. IMPORT TAB        select/create batch → pick 1–40 photos
        │ POST /api/batches/:id/screenshots
        ▼
1. INGEST            per file: sha256 → dup-in-this-batch? skip : store + w×h + app guess
                     INSERT screenshots (ocr=queued, llm=queued)
                     → ImportScreen shows file list immediately, per-file delete
        │ user taps "Read all"  → POST /api/batches/:id/process
        ▼
2. PROCESS BATCH     queue, LLM concurrency 3, commit per screenshot
   per screenshot:
     clearScreenshotExtraction()   (drop machine rows, keep user-edited)
     startExtractionRun()          → RAW extraction_runs

     2a OCR (PaddleOCR th, GPU)         2b VISION LLM (OpenRouter, image only)
        rows[]{text, bbox 0..1, conf}      v2 contract §2.6
        fail → rows=[] (non-blocking)      → {sourceApp, orders[]}
              └────────────┬────────────────┘
     2c NORMALIZE (per order)
        amount / status / net
        date: parse → full | month_only(no time) | none(unparseable OR > referenceDate+3d)
        NO batch.month fallback
     2d SIBLING MONTH FILL
        precision=none: take month from nearest precision=full sibling on SAME screenshot
        found → ordered_at='YYYY-MM', precision=month, flag month_from_siblings
        none  → ordered_at='', precision=none
     2e AMOUNT VERIFY (per order)  →  amount_signal (§4.1)
     2f CONFIDENCE + TIER  →  clean | review | blocked  + flags_json
     2g GLOBAL DEDUPE + UPSERT LEDGER
        key = app | (full? date+time : date) | restaurant_norm | total
        lookup orders WHERE duplicate_key = key         (NO batch_id)
          not found        → INSERT
          found, all equal → silent merge
          found, differs   → tier=blocked, flag dup_conflict
          user_edited=1    → keep human values, store observation only
     2h RAW WRITE
        recordOrderObservation() + recordFieldEvidence() + finishExtractionRun()
        markScreenshotProcessed(counts)
   → AppData 5s poll updates ImportScreen per screenshot
        ▼
3. POSTING SUMMARY   ImportScreen ← GET /api/batches/:id/rollup
   "+34 new · merged 4 · review 3 · blocked 2 · ฿9,270 posted · periods Feb–Apr"
   [ Check 2 blocked ]   [ Go to Dashboard ]
        │                                   │
        ▼ (blocked/review exist)             ▼
4. CHECKFLOW (per screenshot)        5. DASHBOARD TAB  GET /api/ledger/dashboard
   full-width image, below it:          HERO: ฿52,140  (Confirmed only — one number)
     clean rows collapsed ("14")              ⚠ 5 รายการอ่านไม่ชัด — แตะตรวจ   (count, no baht)
     review/blocked rows w/ reason chip       128 orders · 9 restaurants · 4 periods
   [Confirm whole screenshot] bulk       chips: All · Jul26 · Jun26 · … · Unknown
   [Edit] inline field                   MONTH CARDS (tap to expand → orders in period)
   [Delete] 2-tap confirm                SPEND BY APP bar   TOP RESTAURANTS
   confirm/edit → tier=clean, user_edited=1, +correction; auto-advance
        ▼
6. EXPORT TAB
   scope: ( ) whole ledger   ( ) period YYYY-MM   ( ) this batch
   GET /api/ledger/export.xls?period=  → sheet "Monthly" (all periods, Confirmed only)
                                          + sheet "Orders" (cols: month, tier, confidence)
                                          + sheet "Unresolved" (blocked rows, partial data, NO totals)
       .csv → per-order rows + month, tier cols
       .pdf → p1 period summary (Confirmed totals only)
              p2+ full rows; last page "ยังไม่ยืนยัน N รายการ" (no subtotal)
              styles midnight | minimal | audit; PromptPay QR opt
   warn if blocked exist: "N รายการยังไม่ยืนยัน ไม่รวมในยอด — ตรวจก่อน export ได้"
```

---

## 6. BUG REGISTER

Tick `[x]` with `— fixed <sha/date>` when resolved. Never remove a line.

- [x] **B1** binary per-screenshot review — *fixed 2026-08-31*: `reviewStateFromAmountCheck` deleted; per-order `verifyOrderAmount` + `assessOrder` (`confidence.ts`)
- [x] **B2** `bbox.x >= 0.68` geometry gate + whole-screenshot multiset equality — *fixed 2026-08-31*: gate removed from `scanAmountCandidates`; per-order token match instead
- [x] **B3** `bareNumberRe` fallback grabbed ids/distances — *fixed 2026-08-31*: deleted; currency-marked amounts only
- [x] **B4** unreadable-amount orders silently dropped — *fixed 2026-08-31*: `filter(totalAmount>0)` removed from `normalizeLlmOrders`; recorded as `blocked` (`amount_missing`)
- [x] **B5** duplicate on a new screenshot force-flagged `needs_check` — *fixed 2026-08-31*: `upsertOrder` merge never escalates tier past `review` on overlap; test in `tests/ledger.test.ts`
- [x] **B6** unreadable date → `batch.month`-01 fallback — *fixed 2026-08-31*: fallback removed from `normalize.ts`; `datePrecision:'none'` + `""`
- [x] **B7** Shopee "00:00" — *fixed 2026-08-31*: `fmtDateTime(value, precision)` shows month-only / no bare `00:00`
- [x] **B8** Dashboard "N restaurants" counted after `.slice(0,5)` — *fixed 2026-08-31*: HomeScreen uses `dash.restaurantCount` (distinct set, server-side)
- [x] **B9** `refundedOrCancelled` blind to cancelled money — *fixed 2026-08-31*: `getBatchSummary` = `Σgross − Σnet` over confirmed rows; `grossSpend` added; test
- [x] **B10** tab badge scoping — *fixed 2026-08-31*: `App.tsx` badge = `review_tier==='blocked'` count; HomeScreen hero is a single Confirmed number + a separate blocked-count line (no month-filter/badge mismatch)
- [x] **B11** `orderedAt.slice(0,16)` over-merges identical same-day cards — *fixed 2026-08-31*: two cards on ONE screenshot with different `screenOrder` stay separate (`#<shot>:<n>` key); test
- [x] **B12** dedupe + unique index scoped to `batch_id` — *fixed 2026-08-31*: migration → `UNIQUE(duplicate_key)` partial; `upsertOrder` looks up globally; test
- [x] **B13** `orders` FK `ON DELETE CASCADE` on `batch_id` — *fixed 2026-08-31*: migration drops the FK; `deleteBatch` re-points/keeps shared rows; test
- [x] **B14** stale evidence on a merged row after re-read of one screenshot — *fixed 2026-08-31*: `removeScreenshotOrderReferences` queries by evidence membership, orphan-flags human rows
- [x] **B15** no severity tiers — *fixed 2026-08-31*: `review_tier` clean/review/blocked + `flags_json` with per-field codes
- [x] **B16** LLM given no reference date — *fixed 2026-08-31*: `referenceDate` (screenshot upload day) in prompt; future-date guard in `normalize.ts`
- [x] **B17** on-screen amount string discarded — *fixed 2026-08-31*: `totalAmountText` in the contract + `NormalizedOrder`
- [x] **B18** contract lacks `itemCount` / `branch` — *fixed 2026-08-31*: both in v2 prompt + schema + columns
- [x] **B19** dead `evidenceFromIds` / `ExtractedOrder.evidence` — *fixed 2026-08-31*: removed
- [x] **B20** no clipped-card signal — *fixed 2026-08-31*: `partial` in contract → `card_partial` blocking flag
- [x] **B21** `screenOrder` collisions → array index — *fixed 2026-08-31*: collision detected → renumber all by strict position
- [x] **B22** per-order `sourceApp` unused — *resolved 2026-08-31*: `normalizeExtractedOrder` prefers `input.sourceApp` → result → guess. One top-level `sourceApp` per screenshot is correct for these apps (a history list is one app); no further change needed.
- [x] **B23** inconsistent spend base — *fixed 2026-08-31*: summary derives everything from the same confirmed-rows set

---

## 7. WORK CHECKLIST

Each item is a checkbox. Keep the bug refs so we can see coverage. Run `npx tsc -b` after every phase.

### Phase 0 — safety
- [x] P0.1 backup `data/orderledger.db` → `data/orderledger.db.bak-2026-08-31`
- [x] P0.2 add `docs/REDESIGN_PLAN.md` (this file) to git *(staged)*

### Phase 1 — LEDGER + REVIEW core  ✅ done 2026-08-31 (`tsc -b` clean, 12/12 tests, `vite build` ok)
> D4: `blocked` never becomes a baht total; `amount weak` → `review` (shown), `amount missing` → `blocked` (count only).
> D5: relative-date text → `blocked`, no guessing.
> Scope note: kept the column NAME `batch_id` (semantically "first seen in"); no rename to `first_batch_id`. `dup_conflict` auto-detection deferred to Phase 3.
- [x] P1.1 `db.ts`: `migrateOrdersLedgerV2()` — rebuilds `orders`, drops cascade FK, `UNIQUE(duplicate_key)` partial, adds `date_precision/branch/item_count/currency/confidence/review_tier/flags_json`; collapses pre-existing cross-batch dup keys first. Verified on the real DB (86 rows kept, idempotent).
- [x] P1.2 `normalize.ts`: `normalizedDate` returns `{value, precision}`; no `batch.month` fallback; `> now+3d` → `none`; relative-text → `none`; `normalizeExtractedOrder(input, {sourceApp, uniqueSeed, now})`
- [x] P1.3 `normalize.ts`: `evidenceFromIds` + `ExtractedOrder.evidence` removed
- [x] P1.4 `amount-check.ts`: `verifyOrderAmount()` per-order token match; `isRightSidePriceRow` + `bareNumberRe` + `isLikelyNoise` deleted
- [x] P1.5 `openrouter.ts`: v2 prompt + `referenceDate` + `orderedAtText`/`totalAmountText`/`branch`/`itemCount`/`partial`; `sanitizeOrders()` coerces every card, never drops one; LINE MAN address-label + wrong-tab rules added
- [x] P1.6 `process.ts`: `reviewStateFromAmountCheck` gone; no `totalAmount>0` filter; `fillMonthsFromSiblings()` (2d); per-order `verifyOrderAmount` (2e); `assessOrder` → confidence+tier+flags (2f); `screenOrder` collision → renumber (B21)
- [x] P1.7 `store.ts upsertOrder`: global lookup by `duplicate_key`; B11 same-screenshot split via `#<shot>:<n>` suffix; merge never escalates to `blocked` (B5); `user_edited` rows protected. New `flags.ts` helper module.
- [x] P1.8 `store.ts deleteBatch` + `removeScreenshotOrderReferences`: shared rows survive, tag re-pointed, human-owned rows with no evidence get an `orphaned` flag
- [x] P1.9 `store.ts getBatchSummary`: confirmed-only totals, `grossSpend`, `ordersBlocked`, `refundedOrCancelled = gross − net`
- [x] P1.10 `types.ts` + `src/api.ts`: `OrderRow` + `BatchSummary` gain the new fields; `DatePrecision`/`ReviewTier`/`OrderFlag` types
- [x] P1.11 `App.tsx`: tab badge = `review_tier==='blocked'` count only (B10 partial)
- [x] P1.12 `src/api.ts fmtDateTime(value, precision)`: month-only label, no bare `00:00`, `""` for `none`; `HomeScreen` passes `order.date_precision`
- [x] P1.13 `tests/ledger.test.ts` (5 tests, in `npm test`): B12 idempotent · B11 split · B5 no-escalate · B13 shared-row survives delete · B4/B9/D4 blocked excluded + cancelled visible. `tests/normalize.test.ts` rewritten for the new contract.
  - Deferred: "Σ month buckets == ledger net" (needs the Phase 2 aggregator); sibling-fill has an integration path but no unit test yet (needs LLM mock).

### Phase 2 — REPORT  ✅ done 2026-08-31 (`tsc -b` clean · 14/14 tests · `vite build` ok · invariant verified on real DB)
- [x] P2.1 `store.ts`: `getLedgerDashboard()` → `MonthBucket[]` (confirmed only) + unknown bucket last + `confirmedNet/grossSpend/refundedOrCancelled/orderCount/blockedCount/restaurantCount/monthCount/byAppSpend`. Also `getLedgerOrders(period?)`.
- [x] P2.2 `store.ts`: `getBatchRollup(batchId)` — UNION of `orders.batch_id` + JOIN `order_observations` (covers legacy rows); new/merged/review/blocked counts, `netPosted`, `periods[]`
- [x] P2.3 `index.ts`: `GET /api/ledger/dashboard`, `/api/ledger/orders?period=`, `/api/batches/:id/rollup`, `/api/orders/:id/observations`, `/api/screenshots/:id/observations`
- [x] P2.4 `src/api.ts`: `LedgerDashboard`/`MonthBucket`/`BatchRollup`/`OrderObservation` types + `endpoints.ledgerDashboard/ledgerOrders/batchRollup/orderObservations`; `parseFlags()` + `flagLabel()` helpers; `AppData` fetches + exposes `ledgerDashboard` (5s poll)
- [x] P2.5 `HomeScreen.tsx`: reads `ledgerDashboard`; hero = single Confirmed baht + "⚠ N รายการอ่านไม่ชัด" count (no pending baht); month cards = expandable list (`MonthCard`); restaurant count from `dash.restaurantCount` (B8 fixed); month-only rows show "ไม่ระบุวันที่"
- [x] P2.6 `CheckFlow.tsx`: per-row reason chips from `flags_json` (`flagLabel`, block chips styled red)
- [x] P2.7 `ImportScreen.tsx`: "โพสต์เข้าบัญชีแล้ว" posting summary from `getBatchRollup` (new/merged/netPosted/periods/review/blocked)

### Phase 3 — EXPORT + prompt hardening + charts  ✅ done 2026-08-31 (`tsc -b` clean · 14/14 tests · `vite build` ok · ledger CSV/XLS smoke-tested on real DB)
- [x] P3.1 `export.ts`: `orderRows()` gains `Month`/`Branch`/`Tier`/`Confidence` cols, no bare `00:00` time; `summarizeOrders` confirmed-only + `grossSpend`/`ordersBlocked`
- [x] P3.1b `export.ts`: `buildLedgerCsvExport` / `buildLedgerExcelExport({period?})` — ledger scope, XLS has a `Monthly` sheet (all periods, per-app columns)
- [~] P3.2 ledger PDF: `buildLedgerPdfExport({period?})` reuses `renderBatchInvoiceHtml` with a synthetic batch + confirmed-only summary + PromptPay. **Deferred:** a dedicated monthly-breakdown *page* inside `pdf-template.ts` (the template is large + in the dirty tree; period filter + confirmed totals already work).
- [x] P3.3 `index.ts`: `GET /api/ledger/export.{xls,csv,pdf}?period=`; `src/api.ts` `endpoints.ledgerExportUrl`; `ExportScreen` scope toggle (ทั้ง ledger / batch นี้) + period chips from the dashboard
- [x] P3.4 `openrouter.ts` prompt: LINE MAN address-label exclusion + wrong-tab exclusion (landed in P1.5)
- [~] P3.5 Dashboard charts: `MiniCharts` — month-over-month net-spend bars + weekday-frequency bars (pure CSS, no lib). **Deferred:** app donut (the split bar already covers it) and hour-of-day heatmap (most Shopee orders have no time).
- [~] P3.6 `restaurant_truncated`: detected in `normalize.ts` (`isTruncatedName`), surfaced as an info flag + chip. **Deferred:** prefix-aware auto-merge — genuinely hazardous across branches ("KFC (…" collisions), left as a manual-review signal.

---

## 8. DECISIONS (resolved 2026-08-31)

- [x] **D1** rebuild `orders` + migrate — **APPROVED**. Backup `data/orderledger.db` first.
- [x] **D2** sibling-month fill across a 2-month span → take month of the nearest `screenOrder` full-precision sibling. **Confirmed.**
- [x] **D3** keep `batches.month` column for insert-stability but treat it as a plain label — **never used in date/month logic**. Resolved.
- [x] **D4** `blocked` orders are **never rendered as a baht figure** — not in hero, month cards, or any total. They surface only as a count + CheckFlow queue, and an "Unresolved" export section with no subtotal. `weak` amount (number present, unverified) is downgraded to `review`, not `blocked`, so it still shows. Resolved.
- [x] **D5** the 3 target apps' history lists always show absolute dates. Relative-date text ("เมื่อวาน"/"Yesterday"/"N days ago") is treated as abnormal → order goes straight to `blocked`, no date-guessing. Resolved.

---

## 9. PROGRESS LOG

| date | phase/item | note |
|------|-----------|------|
| 2026-08-31 | audit | full read; bug register B1–B23; plan drafted |
| 2026-08-31 | decisions | D1 approved (backup+migrate); D2–D5 resolved; blocked = count only, never a baht total |
| 2026-08-31 | Phase 0 | DB backed up; plan committed to git |
| 2026-08-31 | Phase 1 | LEDGER + REVIEW core landed: 20/23 bugs fixed or partly fixed (B8 + hero split → Phase 2, dup_conflict → Phase 3). `tsc -b` clean · `npm test` 12/12 · `vite build` ok · migration verified on real DB. New files: `server/flags.ts`, `server/extraction/confidence.ts`, `tests/ledger.test.ts`. |
| 2026-08-31 | Phase 2 | REPORT landed: `getLedgerDashboard` / `getBatchRollup` + 5 new routes + `AppData` wiring. `HomeScreen` rewritten to month-cards; `CheckFlow` reason chips; `ImportScreen` posting summary. B8 fixed. `tsc -b` clean · `npm test` 14/14 (added dashboard invariant + rollup tests) · `vite build` ok. |
| 2026-08-31 | Phase 3 | EXPORT + charts + truncation flag: ledger-scope CSV/XLS/PDF (`?period=`) with a `Monthly` sheet, `ExportScreen` scope toggle, `MiniCharts` on the dashboard, `restaurant_truncated` signal. B8/B10/B22 closed out. Deferred (documented): PDF monthly-page, app donut / hour heatmap, prefix-aware auto-merge. `tsc -b` clean · `npm test` 14/14 · `vite build` ok · ledger exports smoke-tested. **All planned bugs B1–B23 resolved or consciously deferred.** |
