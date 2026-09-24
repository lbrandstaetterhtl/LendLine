import type { NextFunction, Request, Response } from "express";

import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
      callback(new Error("Nur JPG, PNG, WEBP oder GIF"));
      return;
    }
    callback(null, true);
  },
});

// Logos may be SVG; `/api/uploads` is served with a CSP that keeps scripts in them from running.
const logoTypes = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, brandingDir),
    filename: (_req, file, callback) => {
      callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!file.mimetype.startsWith("image/") || !logoTypes.has(ext)) {
      callback(new Error("Nur SVG, PNG, JPG oder WEBP"));
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
      next(new HttpError(400, "Die Datei ist zu groß"));
      return;
    }
    const message = error instanceof Error ? error.message : "Upload fehlgeschlagen";
    next(new HttpError(400, message));
  };
}

export function uploadDeviceImages(req: Request, res: Response, next: NextFunction) {
  upload.array("images", 8)(req, res, toHttpError(next));
}

export function uploadLogo(req: Request, res: Response, next: NextFunction) {
  logoUpload.single("logo")(req, res, toHttpError(next));
}
