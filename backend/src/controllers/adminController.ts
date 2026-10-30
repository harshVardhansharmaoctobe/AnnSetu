import type { Request, Response } from "express";
import { User } from "../models/User.js";
import { listApplications, listAuthorized, platformOverview } from "../services/directoryService.js";
import { readLocal } from "../services/ipfsService.js";
import { notFound } from "../utils/errors.js";
import { addressSchema } from "../validators/schemas.js";
import { publicUser } from "./authController.js";

export async function overview(_req: Request, res: Response) {
  res.json(await platformOverview());
}

export async function applications(_req: Request, res: Response) {
  res.json({ applications: await listApplications() });
}

export async function users(_req: Request, res: Response) {
  const list = await User.find().sort({ createdAt: -1 }).limit(500).lean();
  res.json({ users: list.map(publicUser) });
}

export async function authorizedNgos(_req: Request, res: Response) {
  res.json({ accounts: await listAuthorized("NGO") });
}

export async function authorizedVerifiers(_req: Request, res: Response) {
  res.json({ accounts: await listAuthorized("VERIFIER") });
}

export async function userProfile(req: Request, res: Response) {
  const address = addressSchema.parse(req.params.address);
  const user = await User.findOne({ address }).lean();
  if (!user) throw notFound("No profile for this address");
  const { email: _email, ...profile } = publicUser(user);
  res.json({ user: profile });
}

/** Serves files from the local development storage fallback. These are NOT on IPFS. */
export async function localFile(req: Request, res: Response) {
  const file = await readLocal(String(req.params.sha256));
  if (!file) throw notFound("File not found in local development storage");
  res.setHeader("Content-Type", file.mime);
  res.setHeader("Content-Disposition", `inline; filename="${file.name.replace(/"/g, "")}"`);
  res.setHeader("X-TrustChain-Storage", "local-dev (not IPFS)");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(file.data);
}
