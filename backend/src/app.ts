import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { isDbConnected } from "./config/db.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { api } from "./routes/index.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()) }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", db: isDbConnected() ? "connected" : "disconnected" });
  });
  app.use("/api", api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
