# AI Agent Instructions - OrderLedger

This file is the first thing an AI coding agent should read before changing this repo.

## Product Identity

OrderLedger is an independent, local-first food order screenshot reader. It is not Muse and must not mention Muse in product UI, docs for users, data model names, or runtime behavior.

The app turns screenshots from food delivery apps into a monthly spending summary and export files.

Primary platforms:
- Grab
- LINE MAN
- ShopeeFood
- Unknown / unsupported fallback

## Canonical User Flow

The real flow is intentionally simple:

1. User creates or selects an import session.
2. User uploads many iPhone screenshots, often 20-30+ images.
3. The Import workspace immediately shows uploaded files and lets the user delete mistakes before reading.
4. User taps one clear Read action to run OpenRouter order extraction + OCR amount check.
5. The Import workspace shows OCR text, extracted rows, detected months, app counts, per-screenshot amount-check badges, and batch status.
6. If any rows are flagged `needs_check`, an optional **"Check N orders"** button appears in Import. It opens `src/components/CheckFlow.tsx`, a full-screen page-by-page review: one screenshot image per page (shown at full width/natural size, never cropped), the flagged orders extracted from that image listed below it with tap-to-edit-inline, and either "Confirm all correct" (bulk) or per-row Edit/Delete.
7. User opens Dashboard for the summary: net spend, completed spend, order count, months, restaurants, apps, and rows that may need checking.
8. User exports Excel / CSV / PDF.

Important: Review/Check is not a primary step. Do not make Check a main tab or required workflow — it is entered only from the Import workspace button above, never from the bottom tab bar. Mismatched, cancelled, refunded, or incomplete rows can be surfaced as "Needs check", but the main app should feel like import workspace -> read -> dashboard -> export.

## Current Runtime Shape

- Frontend: React + Vite on port 5174.
- Backend: Express on port 8788.
- Database: SQLite at `data/orderledger.db`.
- Upload storage: `data/uploads/`.
- Export storage/runtime generation: `data/exports/` and export builders in `server/export.ts`.
- OCR worker: `scripts/paddle_ocr_worker.py` via `server/ocr/ocr-runner.ts`.
- Order Extraction: OpenRouter vision path in `server/extraction/openrouter.ts` (sole extractor — no fallback).
- Amount Checker: PaddleOCR visible amount scanner with multiset comparison in `server/extraction/amount-check.ts` (trust gate).
- Check/confirm UI: `src/components/CheckFlow.tsx`, entered only via a button in `src/screens/ImportScreen.tsx` when `needs_check` orders exist for the active batch.
- Model picker: `/api/settings/openrouter-models` filters OpenRouter's `/models` response to `architecture.input_modalities.includes("image")` only (`server/index.ts`) — this app always sends screenshots as images, so text-only models are excluded before they ever reach Settings.
- Each screenshot records which engine actually processed it in `screenshots.extraction_engine` (e.g. `openrouter:google/gemini-2.5-flash-lite`), shown in Import as "Read with …".

## Dev Commands

```bash
npm install
copy .env.example .env
npm run ocr:install
npm run dev
```

`npm run dev` runs both:
- `dev:server`: `tsx watch --clear-screen=false --include .env server/index.ts`
- `dev:web`: `vite --host 0.0.0.0`

After starting `npm run dev` once, frontend code hot-reloads and backend code / `.env` changes restart automatically.

Build check:

```bash
npm run build
```

## Verification

Do not spin up a browser preview / Claude Preview server to verify UI changes in this repo. Run `npx tsc -b` (or `npm run build`) to confirm the code compiles, then stop there — the user runs the real `npm run dev` session themselves (often from their phone against the same batch) and will test changes manually. Do not touch `.claude/launch.json` for ad-hoc debug preview servers either.

## Environment

`.env` keys:

- `PORT=8788`
- `HOST=127.0.0.1`
- `OPENROUTER_API_KEY=` **required** — `heuristics.ts` was removed; `processBatch` throws immediately if no key is configured (in `.env` or saved Settings). There is no fallback extractor anymore.
- `OPENROUTER_MODEL=` optional; defaults to `google/gemini-2.5-flash-lite` if unset (`server/extraction/openrouter.ts`)
- `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
- `ORDERLEDGER_PADDLE_PYTHON=` optional Python path
- `ORDERLEDGER_PADDLE_LANG=th`
- `ORDERLEDGER_PADDLE_TIMEOUT_MS=90000`
- `ORDERLEDGER_WRITE_PROCESSING_CACHE=false`

Never commit `.env`, database files, uploads, exports, or secrets.

## Architecture Rules

- Keep OrderLedger independent. Do not import from Muse, copy Muse runtime owners, or add Muse naming.
- Keep the import flow staged but simple. Upload should only store screenshots and show the file list; Read should run OpenRouter order extraction + OCR amount check; Dashboard should only show extracted summary.
- Keep API calls centralized in `src/api.ts`.
- Keep shared client state in `src/state/AppData.tsx`.
- Keep backend route ownership in `server/index.ts` unless a route area becomes large enough to justify a focused router split.
- Keep extraction ownership in `server/extraction/`.
- Keep OCR ownership in `server/ocr/`.
- Keep DB schema and migrations in `server/db.ts` / `server/store.ts`.
- Keep the Check/confirm flow in `src/components/CheckFlow.tsx`, entered only from an Import-workspace button — never add it to `TabBar` (`src/components/ui.tsx`).
- Prefer improving extraction accuracy over adding workflow complexity.
- Do not add a new queue, cache, or worker abstraction unless the current process path cannot support the requirement.

## UI Direction

Mobile-first iPhone usage is the priority.

The design should feel like a modern working ledger:
- cool paper surface, not warm cream
- clear money hierarchy
- compact summary cards
- visible upload affordance
- export actions easy to find
- correction/attention states treated as helpful warnings, not blockers

Navigation should stay small:
- Home / Summary
- History / Batches
- Export
- Settings sheet

Avoid making a marketing landing page.

## Data Semantics

`ordersNeedingReview` currently means rows that may need checking. In user-facing UI, prefer "Needs check" or "May need checking" over "Review" unless building an explicit optional correction screen.

Possible reasons a row needs checking:
- OCR amount check mismatch or unavailable
- cancelled order
- refunded order
- incomplete date/amount/restaurant data
- duplicate or merged evidence uncertainty

Exports may still be allowed when rows need checking; warn clearly instead of blocking by default.

## Git / Dirty Tree Discipline

This repo may have active uncommitted UI work. Do not revert files you did not intentionally edit.

Before editing:
- run `git status --short --branch`
- inspect only relevant files
- keep changes scoped

When committing in a dirty tree:
- stage only files changed for the current task
- do not include unrelated design or generated changes
- do not remove data, uploads, exports, or environment files

## Known Issues (verified 2026-07-10)

- **Local PaddleOCR is FIXED and working** (2026-07-10). The working combo is the project's own `.venv-ocr` (`paddlepaddle==3.2.2`, pinned in `requirements-ocr.txt`) on **CPU** (`paddle_device: "cpu"`, ~8–13s per screenshot). Verify with `npx tsx scripts/ocr-smoke.ts` — it runs the real settings → worker → queue → amount-scan path against the latest uploaded screenshots.
  - The old failure had two causes, both config: (1) settings/`.env` pointed `paddle_python` at the Muse GPU venv (`C:\Users\newpo\.muse-manga-ocr-gpu`), which crashes with `Could not locate cublasLt64_13.dll` on `device=gpu` and hits the `paddlepaddle 3.3.x` PIR/oneDNN bug (`ConvertPirAttribute2RuntimeAttribute`) on CPU; (2) `paddle_device` defaulted to `"gpu"`.
  - **Do not upgrade paddlepaddle to 3.3.x** and do not point `paddle_python` back at the Muse venv. The worker now auto-falls back GPU→CPU at init, and the runner drains the queue after 3 consecutive init failures instead of hanging every screenshot.
  - If OCR fails, extraction still works: `processBatch` catches the OCR error and continues to OpenRouter; only the amount-check verifier degrades to `"unavailable"` (rows land in `needs_check`).
- **OpenRouter extraction is confirmed working end-to-end** (real batch: 3/3 screenshots read, 16 orders extracted). Do not assume it's broken — check `getAppSettings().openrouter_api_key` (Settings sheet or `.env`) is actually set before debugging extraction failures.

## Start Here

Read `PROJECT_INDEX.md` after this file for the map of files, routes, and data flow.
