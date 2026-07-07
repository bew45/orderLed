import { createHash } from "crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "path";
import sharp from "sharp";
import { DATA_DIR } from "./db";

export const UPLOAD_DIR = join(DATA_DIR, "uploads");
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

const ALLOWED_MIMES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);

mkdirSync(UPLOAD_DIR, { recursive: true });

function assertInsideRoot(path: string) {
  const root = resolve(UPLOAD_DIR);
  const full = resolve(path);
  const rel = relative(root, full);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Invalid upload path");
  return full;
}

function safeBase(name: string) {
  return basename(name || "screenshot")
    .replace(extname(name || ""), "")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 70) || "screenshot";
}

export function readStoredImage(storagePath: string) {
  const normalized = String(storagePath).replace(/\\/g, "/").replace(/^data\/uploads\//, "");
  return assertInsideRoot(join(UPLOAD_DIR, ...normalized.split("/").filter(Boolean)));
}

export async function writeScreenshotImage(input: {
  batchId: string;
  screenshotId: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const mime = String(input.mimeType).split(";")[0].trim().toLowerCase();
  const ext = ALLOWED_MIMES.get(mime);
  if (!ext) throw new Error(`Unsupported image type: ${mime || "unknown"}`);
  if (!input.buffer.length) throw new Error("Image is empty");
  if (input.buffer.length > MAX_IMAGE_BYTES) throw new Error("Image is too large");

  const batchDir = input.batchId.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const dir = assertInsideRoot(join(UPLOAD_DIR, batchDir));
  mkdirSync(dir, { recursive: true });

  const filename = `${input.screenshotId}-${safeBase(input.originalName)}${ext}`;
  const path = assertInsideRoot(join(dir, filename));
  writeFileSync(path, input.buffer);

  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(path).rotate().metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    // Metadata is helpful but not required for storage.
  }

  return {
    storagePath: `data/uploads/${batchDir}/${filename}`,
    contentHash: createHash("sha256").update(input.buffer).digest("hex"),
    width,
    height
  };
}

export function deleteStoredImage(storagePath: string) {
  try {
    const path = readStoredImage(storagePath);
    if (existsSync(path)) rmSync(path, { force: true });
  } catch {
    // Best effort cleanup.
  }
}
