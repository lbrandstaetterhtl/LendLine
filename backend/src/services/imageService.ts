import fs from "node:fs/promises";
import path from "node:path";

import { formatDate } from "../emails/format.js";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "./auditService.js";

export const uploadDir = path.join(process.cwd(), "uploads", "devices");

export function imageUrl(fileName: string): string {
  return `/api/uploads/devices/${fileName}`;
}

export async function addImages(deviceId: string, files: Express.Multer.File[], actorId: string) {
  if (files.length === 0) throw new HttpError(400, "Keine Bilder ausgewählt");
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { _count: { select: { images: true } } },
  });
  if (!device) {
    await Promise.all(files.map(async (file) => fs.unlink(file.path).catch(() => undefined)));
    throw new HttpError(404, "Gerät nicht gefunden");
  }
  if (device._count.images + files.length > 8) {
    await Promise.all(files.map(async (file) => fs.unlink(file.path).catch(() => undefined)));
    throw new HttpError(400, "Ein Gerät kann höchstens 8 Bilder haben");
  }
  await prisma.deviceImage.createMany({
    data: files.map((file) => ({ deviceId, fileName: file.filename })),
  });
  await recordAudit({
    actorId,
    action: "IMAGE_ADDED",
    entityType: "DEVICE",
    entityId: deviceId,
    summary: `${files.length} Bild${files.length === 1 ? "" : "er"} zu „${device.name}“ hochgeladen`,
    details: {
      context: {
        Dateien: files.map((file) => file.originalname).join(", "),
        Größe: `${(files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB`,
        "Bilder gesamt": String(device._count.images + files.length),
      },
    },
  });
  return prisma.deviceImage.findMany({ where: { deviceId }, orderBy: { createdAt: "asc" } });
}

export async function deleteImage(deviceId: string, imageId: string, actorId: string) {
  const image = await prisma.deviceImage.findFirst({ where: { id: imageId, deviceId } });
  if (!image) throw new HttpError(404, "Bild nicht gefunden");
  await prisma.deviceImage.delete({ where: { id: image.id } });
  await fs.unlink(path.join(uploadDir, image.fileName)).catch(() => undefined);
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { name: true, _count: { select: { images: true } } },
  });
  await recordAudit({
    actorId,
    action: "IMAGE_REMOVED",
    entityType: "DEVICE",
    entityId: deviceId,
    summary: `Bild von „${device?.name || "Gerät"}“ entfernt`,
    details: {
      context: {
        "Hochgeladen am": formatDate(image.createdAt),
        "Bilder übrig": String(device?._count.images ?? 0),
      },
    },
  });
}

export async function deleteDeviceFiles(deviceId: string) {
  const images = await prisma.deviceImage.findMany({ where: { deviceId } });
  await Promise.all(
    images.map(async (image) =>
      fs.unlink(path.join(uploadDir, image.fileName)).catch(() => undefined)
    )
  );
}
