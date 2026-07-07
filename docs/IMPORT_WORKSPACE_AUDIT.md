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
6. OCR rows and extracted order rows are stored on the batch.
7. Import workspace shows detected months, apps, row count, OCR count, and per-file OCR previews.
8. User opens Dashboard for spending analytics and exports.

## UI Ownership

- `src/screens/ImportScreen.tsx` owns the staged import workspace.
- `src/screens/UploadFlow.tsx` owns file selection and upload only.
- `src/components/ScreenshotList.tsx` owns uploaded file rows and OCR previews.
- `src/screens/HomeScreen.tsx` owns the finished dashboard.
- `src/components/SettingsSheet.tsx` owns extraction settings and model choice.

## Backend Ownership

- `server/extraction/process.ts` owns OCR/extraction execution.
- `server/store.ts` stores OCR rows per screenshot and clears stale extracted rows before re-reading.
- `server/db.ts` owns schema and migrations.

## Non-Goals

- Do not make Review a required workflow.
- Do not put raw uploaded screenshots into Dashboard.
- Do not auto-read immediately after upload unless the user explicitly asks for that behavior again.
