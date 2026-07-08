# Import Workspace Audit

This note records the UX/state patterns adapted from the existing local-first apps into OrderLedger. Do not copy branding, feature names, or domain logic from other apps.

## Patterns To Keep

- Lock the app to an iPhone-style viewport. The browser body should not become the scroll surface; the app shell owns vertical scrolling.
- Keep setup/import separate from the finished dashboard. Dashboard is for extracted totals, not raw upload management.
- Use a staged pipeline for long-running work: Upload -> Read OCR -> Extract rows -> Dashboard.
- Show per-file status rows with thumbnails, platform guess, OCR line count, extracted row count, delete action, and errors.
- Keep Settings as sectioned cards with one clear status summary, not a raw config dump.
- Keep API calls centralized in `src/api.ts` and app state in `src/state/AppData.tsx`.

## Current OrderLedger Flow

1. User creates or selects an import session.
2. User uploads screenshots from iPhone Photos.
3. Import workspace immediately shows the uploaded file list.
4. User can delete wrong screenshots before extraction.
5. User taps Read screenshots.
6. OCR amount-scan rows and extracted order rows are stored on the batch; each order gets an amount-check-derived `review_state`.
7. Import workspace shows detected months, apps, row count, OCR count, per-file OCR previews, and per-file amount-check badges ("Numbers matched" / "Needs check" / "Not verified").
8. If any orders are flagged `needs_check`, a "Check N orders" button opens `CheckFlow` — one screenshot page at a time, confirm-all or edit/delete per row.
9. User opens Dashboard for spending analytics and exports.

## UI Ownership

- `src/screens/ImportScreen.tsx` owns the staged import workspace.
- `src/screens/UploadFlow.tsx` owns file selection and upload only.
- `src/components/ScreenshotList.tsx` owns uploaded file rows, OCR previews, and the per-screenshot `AmountCheckPanel`.
- `src/components/CheckFlow.tsx` owns the optional confirm/correct flow, grouped by screenshot page. Only entered via the button in `ImportScreen`.
- `src/screens/HomeScreen.tsx` owns the finished dashboard.
- `src/components/SettingsSheet.tsx` owns extraction settings and model choice (vision-capable models only).

## Backend Ownership

- `server/extraction/process.ts` owns OCR/extraction execution and wires the amount check into each order's `review_state`.
- `server/extraction/amount-check.ts` owns the OCR-vs-AI amount scan and multiset comparison.
- `server/store.ts` stores OCR rows and amount-check state per screenshot, clears stale extracted rows before re-reading, and (`updateOrder`) marks any manually-patched order `corrected`.
- `server/db.ts` owns schema and migrations.

## Non-Goals

- Do not make Check a required workflow or a main tab.
- Do not put raw uploaded screenshots into Dashboard.
- Do not auto-read immediately after upload unless the user explicitly asks for that behavior again.
- Do not add a swipe/gesture library for `CheckFlow` — the user explicitly chose buttons-only (no gesture library is installed in this repo).
