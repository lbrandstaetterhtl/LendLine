import fs from "node:fs/promises";
import path from "node:path";

import { formatDate } from "../emails/format.js";
import { t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";
import { looksLikeImage } from "../lib/imageSniff.js";
import { prisma } from "../lib/prisma.js";
import { recordAudit } from "./auditService.js";

export const uploadDir = path.join(process.cwd(), "uploads", "devices");

export function imageUrl(fileName: string): string {
  return `/api/uploads/devices/${fileName}`;
}

export async function addImages(deviceId: string, files: Express.Multer.File[], actorId: string) {
  if (files.length === 0)
    throw new HttpError(
      400,
      t((m) => m.errors.noImages)
    );
  const checks = await Promise.all(
    files.map(async (file) => looksLikeImage(file.path, path.extname(file.filename)))
  );
  const fake = files.filter((_file, index) => !checks[index]);
  if (fake.length > 0) {
    await Promise.all(files.map(async (file) => fs.unlink(file.path).catch(() => undefined)));
    throw new HttpError(
      400,
      t((m) => m.errors.invalidImages, {
        files: fake.map((file) => file.originalname).join(", "),
      })
    );
  }
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: { _count: { select: { images: true } } },
  });
  if (!device) {
    await Promise.all(files.map(async (file) => fs.unlink(file.path).catch(() => undefined)));
    throw new HttpError(
      404,
      t((m) => m.errors.deviceNotFound)
    );
  }
  if (device._count.images + files.length > 8) {
    await Promise.all(files.map(async (file) => fs.unlink(file.path).catch(() => undefined)));
    throw new HttpError(
      400,
      t((m) => m.errors.tooManyImages)
    );
  }
  await prisma.deviceImage.createMany({
    data: files.map((file) => ({ deviceId, fileName: file.filename })),
  });
  await recordAudit({
    actorId,
    action: "IMAGE_ADDED",
    entityType: "DEVICE",
    entityId: deviceId,
    summary: { key: "audit.imagesAdded", params: { count: files.length, name: device.name } },
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
  if (!image)
    throw new HttpError(
      404,
      t((m) => m.errors.imageNotFound)
    );
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
    summary: { key: "audit.deviceImageRemoved", params: { name: device?.name ?? "–" } },
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
