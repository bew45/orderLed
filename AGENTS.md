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
4. User taps one clear Read action to run OCR/extraction.
5. The Import workspace shows OCR text, extracted rows, detected months, app counts, and batch status.
6. User opens Dashboard for the summary: net spend, completed spend, order count, months, restaurants, apps, and rows that may need checking.
7. User exports Excel / CSV / PDF.

Important: Review is not a primary step. Do not make Review a main tab or required workflow. Low-confidence, cancelled, refunded, or suspicious rows can be surfaced as "Needs check" or an optional correction surface, but the main app should feel like import workspace -> read -> dashboard -> export.

## Current Runtime Shape

- Frontend: React + Vite on port 5174.
- Backend: Express on port 8788.
- Database: SQLite at `data/orderledger.db`.
- Upload storage: `data/uploads/`.
- Export storage/runtime generation: `data/exports/` and export builders in `server/export.ts`.
- OCR worker: `scripts/paddle_ocr_worker.py` via `server/ocr/ocr-runner.ts`.
- LLM extraction: OpenRouter vision path in `server/extraction/openrouter.ts`, heuristic fallback in `server/extraction/heuristics.ts`.

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

## Environment

`.env` keys:

- `PORT=8788`
- `HOST=127.0.0.1`
- `OPENROUTER_API_KEY=` recommended for accurate extraction
- `OPENROUTER_MODEL=` recommended model id
- `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
- `ORDERLEDGER_PADDLE_PYTHON=` optional Python path
- `ORDERLEDGER_PADDLE_LANG=th`
- `ORDERLEDGER_PADDLE_TIMEOUT_MS=90000`
- `ORDERLEDGER_WRITE_PROCESSING_CACHE=false`

Never commit `.env`, database files, uploads, exports, or secrets.

## Architecture Rules

- Keep OrderLedger independent. Do not import from Muse, copy Muse runtime owners, or add Muse naming.
- Keep the import flow staged but simple. Upload should only store screenshots and show the file list; Read should run OCR/extraction; Dashboard should only show extracted summary.
- Keep API calls centralized in `src/api.ts`.
- Keep shared client state in `src/state/AppData.tsx`.
- Keep backend route ownership in `server/index.ts` unless a route area becomes large enough to justify a focused router split.
- Keep extraction ownership in `server/extraction/`.
- Keep OCR ownership in `server/ocr/`.
- Keep DB schema and migrations in `server/db.ts` / `server/store.ts`.
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
- low OCR/LLM confidence
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

## Start Here

Read `PROJECT_INDEX.md` after this file for the map of files, routes, and data flow.
