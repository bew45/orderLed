# OrderLedger Handoff Requirements

## Read This First

This document is a handoff brief for the next AI/engineer who will redesign the OrderLedger UX/UI.

Important: do not treat the current frontend as the final design. The current UI is only a working developer surface for testing the backend flow. The next designer/AI should create a new modern mobile-first UX/UI from scratch.

The product must not mention Muse or depend on Muse. OrderLedger is its own app, repo, database, storage, and user experience.

## Product Summary

OrderLedger is a local-first food order ledger. The user uploads screenshots from food delivery order history screens, mostly from an iPhone, and the app extracts order rows into a clean monthly ledger.

Primary v1 goal:

- read screenshots accurately
- extract food order rows
- detect completed/cancelled/refunded orders
- keep totals correct
- allow quick review/correction
- export Excel/CSV/PDF

The app should eventually become a food-spending dashboard and eating-pattern analyzer, but v1 must focus on extraction accuracy.

## Current Implementation Status

Repo:

```text
C:\Users\newpo\Desktop\orderLed
https://github.com/bew45/orderLed.git
```

Current backend exists and is usable:

- Express API on port `8788`
- SQLite DB at `data/orderledger.db`
- image uploads stored under `data/uploads/`
- batch creation
- multi-image screenshot upload
- screenshot processing endpoint
- local OCR runner hook
- OCR amount checking and comparison to vision orders
- dedupe/upsert by source app + datetime + restaurant + amount
- editable order rows
- export `.xls`, `.csv`, `.pdf`

Current frontend exists only as a functional placeholder:

- Vite/React on port `5174`
- batch list
- upload control
- process button
- summary cards
- editable table
- export links
- settings sheet scaffold with OpenRouter/OCR fields, searchable model picker, selected model row, and favorite model stars

The current frontend should be replaced by a more polished mobile-first experience.

## Known OCR Reality

PaddleOCR was installed into `.venv-ocr`, and `npm run ocr:smoke` works.

However, running PaddleOCR against a real screenshot on this Windows/Python/Paddle combination currently hits a Paddle runtime error:

```text
ConvertPirAttribute2RuntimeAttribute not support [pir::ArrayAttribute<pir::DoubleAttribute>]
```

The backend was adjusted so this does not block the product flow:

- it tries local OCR first for amount checking
- if OCR fails, it still runs OpenRouter vision extraction, but sets amount check state to unavailable
- if OpenRouter API key is missing or extraction fails, screenshot processing fails with a useful error

OCR is the amount checker, OpenRouter vision is the order extractor, and multiset comparison is the trust gate. Local OCR is still useful later for evidence boxes, cost reduction, and offline mode.

## Design Assignment For The Next UX/UI AI

Do not copy the current UI.

Design a new modern, polished, mobile-first interface. The main device is iPhone. The user should be able to open the app on their phone, upload many screenshots from Photos, process them, review uncertain rows, and export results without feeling like they are using a developer tool.

The next AI should decide the visual style, layout, component language, motion, spacing, typography, icons, and interaction patterns. The only requirements are:

- modern
- premium
- mobile-first
- clean enough for financial review
- fast for repeated monthly use
- friendly to Thai/English mixed text
- designed around iPhone screenshot upload

Suggested product personality, not mandatory:

- calm financial notebook
- premium but not flashy
- clean ivory/white surface with tasteful accent colors
- dense enough for tables, but not spreadsheet-hostile on mobile
- confident error/review states

The designer should produce:

- mobile home/dashboard
- create/import batch flow
- multi-screenshot upload flow
- processing/progress state
- optional correction surface for check state warning rows
- settings screen or bottom sheet for extraction model setup
- export screen
- future analytics/dashboard direction

## Settings UX Requirement

A basic Settings scaffold now exists. It is functional, not final.

The next UX/UI AI should redesign it fully while preserving the product intent:

- make model setup feel safe and understandable
- keep OpenRouter as the recommended accurate extraction path
- allow the user to paste/update an API key
- allow choosing a model from a searchable list
- allow favoriting models with a star/pin interaction
- show the selected model clearly
- keep OCR settings present but visually secondary/optional
- make it work well on iPhone, ideally as a bottom sheet or focused settings screen

The current scaffold uses this interaction pattern:

- provider chip
- search box
- Favorites section
- All models section
- selected checkmark
- favorite star
- model id/name/context metadata

Do not copy the current styling exactly. Treat it as interaction proof. Redesign the UI to be modern, polished, and consistent with the new OrderLedger visual system.

## Mobile-First User Flow

### 1. Open App

User lands on the current month dashboard.

Show:

- current month
- net spend
- completed spend
- order count
- rows needing review
- last import status

Primary action:

- upload screenshots

### 2. Upload From iPhone

The upload flow must be comfortable on mobile.

Requirements:

- support selecting many images from Photos
- show selected count before upload
- show duplicate/skipped count after upload
- explain that screenshots can be from Grab, LINE MAN, or ShopeeFood
- no drag/drop as the primary mobile path
- allow adding more screenshots to the same batch later

The user will often upload 20-30+ screenshots per month.

### 3. Process Screenshots

After upload, user taps one clear action:

```text
Read screenshots
```

Processing state should show:

- screenshots queued
- screenshots processed
- screenshots failed
- orders found
- rows needing review

Do not show raw OCR internals unless in a future developer/debug mode.

### 4. Check Extracted Orders (Optional)

Check state warning rows ("Needs check" or "May need checking") are surfaced to the user.

Requirements:
- OCR amount checker mismatch or unavailable status clearly flagged
- quick edit or deletion for erroneous rows
- status must be very clear: completed, cancelled, refunded, unknown
- totals must visibly update after edits

Ideal mobile pattern:
- list of order rows with warning badges
- tap row opens a bottom sheet/detail screen for correction

### 5. Export

Export should be obvious after review.

Buttons:

- Excel
- CSV
- PDF

Filename pattern:

```text
orderledger-YYYY-MM.xls
orderledger-YYYY-MM.csv
orderledger-YYYY-MM.pdf
```

The export UI should make it clear whether rows still need review before export.

## Future Product Direction

Do not build all of this in v1, but design with room for it.

Future features:

- continuous monthly database: import more screenshots into the same month over time
- append to existing data without losing corrected rows
- import from previous Excel exports
- merge old Excel rows with current DB rows
- restaurant dashboard
- spend by app
- spend by week/month
- cancelled/refunded analysis
- average order value
- top restaurants
- food category inference
- "eating habits" dashboard
- recurring order detection
- budget warning
- searchable order history
- backup/restore

The data model already supports continuous import because batches and orders are persisted in SQLite and dedupe is based on stable order fields.

## Current API Surface

Use these endpoints from the redesigned UI.

### Health

```text
GET /api/health
```

### Batches

```text
POST /api/batches
GET /api/batches
GET /api/batches/:id
DELETE /api/batches/:id
```

Create body:

```json
{
  "title": "Food orders 2026-06",
  "month": "2026-06"
}
```

### Upload Screenshots

```text
POST /api/batches/:id/screenshots
```

FormData:

```text
files: image[]
```

Response includes:

- added screenshots
- skipped duplicates
- batch summary

### Process

```text
POST /api/batches/:id/process
```

Body:

```json
{
  "force": false
}
```

Use `force: true` only for explicit reprocess.

### Orders

```text
GET /api/batches/:id/orders
PATCH /api/orders/:id
DELETE /api/orders/:id
```

Editable fields:

- `source_app`
- `ordered_at`
- `restaurant_name`
- `total_amount`
- `status`
- `refund_amount`
- `net_amount`
- `items_text`

Patching marks the row as `corrected`.

### Screenshot Image

```text
GET /api/screenshots/:id/image
```

### Export

```text
GET /api/batches/:id/export.xls
GET /api/batches/:id/export.csv
GET /api/batches/:id/export.pdf
```

### Settings

```text
GET /api/settings
PATCH /api/settings
GET /api/settings/openrouter-models
```

Settings fields:

```json
{
  "openrouter_api_key": "masked on read when present",
  "openrouter_model": "google/gemini-2.5-flash-lite",
  "openrouter_base_url": "https://openrouter.ai/api/v1",
  "paddle_python": ".venv-ocr\\Scripts\\python.exe",
  "paddle_lang": "th",
  "paddle_timeout_ms": 90000,
  "favorite_models": ["google/gemini-2.5-flash-lite"]
}
```

Notes:

- settings are stored locally in SQLite `app_settings`
- `.env` values are defaults
- saved settings override `.env`
- `openrouter_api_key` is masked on read as `••••••••`
- sending the masked value back preserves the stored key
- model list comes from OpenRouter `/models`

## Current Data Concepts

### Batch

A monthly/import group.

Fields:

- `id`
- `title`
- `month`
- `created_at`
- `updated_at`

### Screenshot

Original uploaded image.

Fields:

- `id`
- `batch_id`
- `original_name`
- `storage_path`
- `content_hash`
- `source_app_guess`
- `width`
- `height`
- `processed_at`
- `error`

### Order

Final user-facing ledger row.

Fields:

- `id`
- `batch_id`
- `source_app`
- `ordered_at`
- `restaurant_name`
- `total_amount`
- `status`
- `refund_amount`
- `net_amount`
- `items_text`
- `review_state`
- `duplicate_key`
- `source_screenshot_ids_json`
- `evidence_json`

Important: do not expose internal OCR concepts as the main user model. Users care about orders and totals.

## Environment Setup

Required:

```env
PORT=8788
HOST=127.0.0.1
```

Recommended for accurate extraction:

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=google/gemini-2.5-flash-lite
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

OCR configuration:

```env
ORDERLEDGER_PADDLE_PYTHON=.venv-ocr\Scripts\python.exe
ORDERLEDGER_PADDLE_LANG=th
ORDERLEDGER_PADDLE_TIMEOUT_MS=90000
```

Optional:

```env
ORDERLEDGER_WRITE_PROCESSING_CACHE=false
```

Current recommendation:

- configure OpenRouter first
- keep OCR installed but do not rely on it as the only extraction path until the Paddle runtime issue is resolved
- users can also configure these through the current Settings scaffold in the app

## How To Run

Install Node dependencies:

```bash
npm install
```

Create local env:

```bash
copy .env.example .env
```

Install OCR environment:

```bash
npm run ocr:install
```

Run dev app:

```bash
npm run dev
```

Open:

```text
http://localhost:5174
```

Backend:

```text
http://127.0.0.1:8788
```

Health check:

```text
http://127.0.0.1:8788/api/health
```

## Verification Already Done

The current implementation was checked with:

```bash
npm install
npm audit --omit=dev
npm run build
npm run ocr:install
npm run ocr:smoke
```

Results:

- build passes
- npm production audit has 0 vulnerabilities
- OCR install completes
- OCR help smoke works
- Express health endpoint responds
- PaddleOCR real-image run currently hits the Paddle runtime issue noted above

## UX/UI Redesign Rule

The next AI should not preserve the current frontend structure just because it exists.

The backend contract is the valuable part. The frontend should be redesigned around the user's real workflow:

```text
iPhone screenshots -> monthly import -> accurate extraction -> fast review -> export -> future dashboard
```

Make it beautiful, modern, and practical. Decide the design system from scratch.
