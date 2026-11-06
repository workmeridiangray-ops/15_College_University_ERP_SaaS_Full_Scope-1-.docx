import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { invalid } from "./errors";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));

/** Identify the real type from magic bytes; never trust the extension or client-supplied MIME. */
export function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  return null;
}

export function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, "_").replace(/\.{2,}/g, ".").slice(0, 100);
  return base || "document";
}

export async function saveUpload(institutionId: string, file: File): Promise<{ storedName: string; mime: string; size: number; filename: string }> {
  if (file.size === 0) throw invalid("That file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw invalid("Files must be 5 MB or smaller.");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) throw invalid("Only PDF, PNG or JPG files are accepted.");
  const storedName = `${crypto.randomUUID()}.${kind.ext}`;
  const dir = path.join(uploadRoot(), institutionId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, storedName), buf, { flag: "wx" });
  return { storedName, mime: kind.mime, size: buf.length, filename: safeFilename(file.name) };
}

export async function readUpload(institutionId: string, storedName: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}\.(pdf|png|jpg)$/.test(storedName)) throw new Error("bad stored name");
  return fs.readFile(path.join(uploadRoot(), institutionId, storedName));
}
