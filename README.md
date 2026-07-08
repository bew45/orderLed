# OrderLedger

Local-first food order ledger for turning delivery app screenshots into clean Excel/CSV/PDF summaries.

For AI agents, read [`AGENTS.md`](AGENTS.md) first, then [`PROJECT_INDEX.md`](PROJECT_INDEX.md).

For the full product/UX handoff brief, read [`docs/ORDERLEDGER_HANDOFF_REQUIREMENTS.md`](docs/ORDERLEDGER_HANDOFF_REQUIREMENTS.md).

## Quick Start

```bash
npm install
copy .env.example .env
npm run ocr:install
npm run dev
```

Open `http://localhost:5174`.

**OpenRouter is required, not optional.** There is no local fallback extractor — add `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`, default `google/gemini-2.5-flash-lite`) in `.env` or the Settings sheet before reading screenshots, or `Read` will error immediately.

## Runtime Shape

- React/Vite frontend on port `5174`
- Express backend on port `8788`
- SQLite database at `data/orderledger.db`
- Uploaded screenshots under `data/uploads/`
- Exports under `data/exports/`
- PaddleOCR via `scripts/paddle_ocr_worker.py`

## Current V1 Scope

- Create import sessions
- Upload many screenshots
- Inspect uploaded file list before reading
- Run OpenRouter order extraction and OCR amount checking
- See OCR text, scanned amounts, and verification check states in the Import workspace
- Merge duplicate visible order cards
- Open Dashboard after processing
- Check and correct flagged orders one screenshot-page at a time (`CheckFlow`), entered from an Import-workspace button
- Export Excel, CSV, and PDF

## Current Status (checked against code + live data, 2026-07-08)

Working end-to-end, confirmed with real data today:

- Create/select import, upload screenshots, dedupe by content hash, delete before reading
- Import workspace shows the file list immediately, batch pipeline stages, OCR/order counts, and per-screenshot amount-check badges
- **Reading real screenshots via OpenRouter works.** Confirmed on a live batch: 3/3 screenshots read, 16 orders extracted (`google/gemma-4-31b-it`), engine tracked per screenshot as "Read with OpenRouter · google/gemma-4-31b-it"
- Check flow: flagged (`needs_check`) orders can be confirmed in bulk or edited/deleted per row, grouped by screenshot
- Dashboard aggregates all batches (net spend, completed spend, months, restaurants, apps, status)
- Excel / CSV / PDF export

Known limitation (non-blocking):

- **Local PaddleOCR fails on Windows** with a `paddlepaddle 3.3.1` PIR/oneDNN runtime bug (`ConvertPirAttribute2RuntimeAttribute not support [pir::ArrayAttribute<pir::DoubleAttribute>]`). Order extraction doesn't need it — OpenRouter reads the image directly regardless — but without OCR rows, the amount-check verifier has nothing to cross-check against, so it reports `"unavailable"` and those orders land in `needs_check` more often than they would with working OCR. Fixing PaddleOCR is optional accuracy work, not a blocker.
- Legacy data note: some orders in the DB predate this session and came from `npm run legacy:import-monthly` (manual monthly-total import), not screenshot extraction — those show up as `"Legacy monthly total"` rows, distinguishable by `duplicate_key` starting with `legacy-monthly-total:`.
