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

OpenRouter is optional but recommended. Add `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in `.env` for accurate vision extraction.

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
- Run OCR + extraction
- See OCR text and batch summary in the Import workspace
- Merge duplicate visible order cards
- Open Dashboard after processing
- Optionally check/edit suspicious rows
- Export Excel, CSV, and PDF

## Current Status (checked against code + local data, 2026-07-08)

Working end-to-end today:

- Create/select import, upload screenshots, dedupe by content hash, delete before reading
- Import workspace shows the file list immediately, batch pipeline stages, OCR/order counts
- Dashboard aggregates all batches (net spend, completed spend, months, restaurants, apps, status)
- Excel / CSV / PDF export

Not working out of the box:

- **Reading real screenshots currently fails.** Local PaddleOCR hits a Windows/Paddle runtime bug (`ConvertPirAttribute2RuntimeAttribute not support [pir::ArrayAttribute<pir::DoubleAttribute>]`), and `OPENROUTER_API_KEY` is unset in both `.env` and saved Settings, so the OpenRouter vision fallback has nothing to fall back to. `Read screenshots` errors out for any new upload until one of the two extraction paths is fixed/configured.
- The orders visible in Dashboard right now all come from `npm run legacy:import-monthly` (a one-off script that inserts monthly totals directly into the DB), not from screenshot extraction. No screenshot has ever produced a real order row in this environment.

To unblock extraction, set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`) via Settings or `.env` — this bypasses the broken local OCR path entirely since OpenRouter reads the image directly.
