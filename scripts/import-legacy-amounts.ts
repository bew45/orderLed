import { readFileSync } from "fs";
import { createBatch, getBatchSummary } from "../server/store";
import { importLegacyAmountText } from "../server/legacy-import";

function usage() {
  console.log("Usage: npx tsx scripts/import-legacy-amounts.ts <legacy-text-file> [title]");
  console.log("Example: npx tsx scripts/import-legacy-amounts.ts pasted-text.txt \"Legacy amounts 2025\"");
}

const [, , filePath, ...titleParts] = process.argv;
if (!filePath || filePath === "--help" || filePath === "-h") {
  usage();
  process.exit(filePath ? 0 : 1);
}

const text = readFileSync(filePath, "utf8");
const title = titleParts.join(" ").trim() || "Legacy amount-only import";
const batch = createBatch({ title, month: new Date().toISOString().slice(0, 7) });
const result = importLegacyAmountText(batch.id, text);
const summary = getBatchSummary(batch.id);

console.log(JSON.stringify({
  batchId: batch.id,
  title: batch.title,
  imported: result.imported,
  skipped: result.skipped,
  months: result.months,
  summary
}, null, 2));
