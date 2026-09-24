import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "node:path";

import { config } from "./config.js";
import { asyncHandler } from "./lib/asyncHandler.js";
import { requestContext } from "./lib/requestContext.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { categoryRouter } from "./routes/categories.js";
import { deviceRouter } from "./routes/devices.js";
import { requestRouter } from "./routes/requests.js";
import { roomRouter } from "./routes/rooms.js";
import { userRouter } from "./routes/users.js";
import { getBranding } from "./services/brandingService.js";

export function createApp() {
  const app = express();
  // The API only listens on loopback; a proxy there (Vite in development, a reverse proxy in
  // production) forwards the real client address in X-Forwarded-For.
  app.set("trust proxy", "loopback");
  app.use(requestContext);
  app.use(cors({ origin: config.frontendOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.use(
    "/api/uploads",
    // Uploaded files are only ever images. The CSP stops scripts in an SVG logo from running when
    // someone opens the file directly; <img> never runs them anyway.
    (_req, res, next) => {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; sandbox"
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      next();
    },
    express.static(path.join(process.cwd(), "uploads"))
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  // Public: the login page shows the logo before anyone is signed in.
  app.get(
    "/api/branding",
    asyncHandler(async (_req, res) => {
      res.json(await getBranding());
    })
  );
  app.use("/api/auth", authRouter);
  app.use("/api/categories", categoryRouter);
  app.use("/api/devices", deviceRouter);
  app.use("/api/requests", requestRouter);
  app.use("/api/rooms", roomRouter);
  app.use("/api/users", userRouter);
  app.use("/api/admin", adminRouter);
  app.use(errorHandler);
  return app;
}
