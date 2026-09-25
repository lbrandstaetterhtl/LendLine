import type { NextFunction, Request, Response } from "express";

import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { t } from "../i18n/index.js";
import { HttpError } from "../lib/errors.js";
import { brandingDir } from "../services/brandingService.js";
import { uploadDir } from "../services/imageService.js";

const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(brandingDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${allowed.has(ext) ? ext : ".img"}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!file.mimetype.startsWith("image/") || !allowed.has(ext)) {
      callback(new Error(t((m) => m.errors.deviceImageTypes)));
      return;
    }
    callback(null, true);
  },
});

// Logos may be SVG; `/api/uploads` is served with a CSP that keeps scripts in them from running.
// The content is checked against the extension after the upload (lib/imageSniff.ts).
const logoTypes = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"]);

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, brandingDir),
    filename: (_req, file, callback) => {
      callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  // The login picture is usually a photo, hence more than a logo would need.
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!file.mimetype.startsWith("image/") || !logoTypes.has(ext)) {
      callback(new Error(t((m) => m.errors.brandingImageTypes)));
      return;
    }
    callback(null, true);
  },
});

function toHttpError(next: NextFunction) {
  return (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(
        new HttpError(
          400,
          t((m) => m.errors.fileTooLarge)
        )
      );
      return;
    }
    const message = error instanceof Error ? error.message : t((m) => m.errors.uploadFailed);
    next(new HttpError(400, message));
  };
}

export function uploadDeviceImages(req: Request, res: Response, next: NextFunction) {
  upload.array("images", 8)(req, res, toHttpError(next));
}

export function uploadBrandingImage(req: Request, res: Response, next: NextFunction) {
  logoUpload.single("image")(req, res, toHttpError(next));
}
