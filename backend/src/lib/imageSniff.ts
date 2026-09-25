import fs from "node:fs/promises";

/**
 * Checks that an uploaded file really is the image its extension claims, by its first bytes. The
 * browser-supplied MIME type is not trustworthy; `nosniff` and the upload CSP stop a fake image
 * from running, this stops it from being stored at all.
 */
const signatures: Record<string, (head: Buffer) => boolean> = {
  ".png": (head) => head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  ".jpg": (head) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  ".jpeg": (head) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  ".gif": (head) => ["GIF87a", "GIF89a"].includes(head.subarray(0, 6).toString("latin1")),
  ".webp": (head) =>
    head.subarray(0, 4).toString("latin1") === "RIFF" &&
    head.subarray(8, 12).toString("latin1") === "WEBP",
  ".ico": (head) => head[0] === 0 && head[1] === 0 && head[2] === 1 && head[3] === 0,
  // Text format: after an optional BOM, XML declaration, comments or doctype comes <svg.
  ".svg": (head) =>
    /^(﻿)?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(
      head.toString("utf8")
    ),
};

export async function looksLikeImage(filePath: string, ext: string): Promise<boolean> {
  const check = signatures[ext.toLowerCase()];
  if (!check) return false;
  const handle = await fs.open(filePath, "r");
  try {
    const head = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    return check(head.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}
