// OCR smoke test: runs the real server OCR path (settings -> worker -> queue -> rows ->
// amount scan) against the most recent uploaded screenshots. Usage: npx tsx scripts/ocr-smoke.ts
import { runOcrQueued } from "../server/ocr/ocr-runner";
import { scanAmountCandidates } from "../server/extraction/amount-check";
import { getAppSettings } from "../server/store";
import { db } from "../server/db";
import type { Screenshot } from "../server/types";

async function main() {
  const settings = getAppSettings();
  console.log(`python=${settings.paddle_python || "(default)"} lang=${settings.paddle_lang} device=${settings.paddle_device}`);

  const shots = db.prepare("SELECT * FROM screenshots ORDER BY created_at DESC LIMIT 2").all() as unknown as Screenshot[];
  if (!shots.length) throw new Error("No screenshots in the database to test with.");

  for (const shot of shots) {
    const started = Date.now();
    const rows = await runOcrQueued(shot);
    const candidates = scanAmountCandidates(rows);
    console.log(`--- ${shot.original_name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    console.log(`rows=${rows.length} sample=${rows.slice(0, 5).map((row) => row.text).join(" | ")}`);
    console.log(`amounts=${candidates.map((candidate) => candidate.amount).join(", ") || "(none)"}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("SMOKE FAILED:", error?.message || error);
  process.exit(1);
});
