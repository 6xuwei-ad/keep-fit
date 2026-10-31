import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface DetectedImage {
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
}

export function detectImage(buffer: Buffer): DetectedImage | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export async function saveImage(
  uploadDir: string,
  buffer: Buffer,
  detected: DetectedImage
): Promise<{ filename: string; url: string; absolutePath: string }> {
  await fs.mkdir(uploadDir, { recursive: true });
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${detected.ext}`;
  const absolutePath = path.join(uploadDir, filename);
  await fs.writeFile(absolutePath, buffer, { flag: "wx" });
  return { filename, url: `/uploads/${filename}`, absolutePath };
}
