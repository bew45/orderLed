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
