import type { Request, Response } from "express";
import * as evidence from "../services/evidenceService.js";
import { parseStorageRef, storageUrl } from "../services/ipfsService.js";
import { evidenceUploadSchema } from "../validators/schemas.js";
import { z } from "zod";

export async function upload(req: Request, res: Response) {
  const input = evidenceUploadSchema.parse(req.body);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const result = await evidence.uploadEvidence(req.auth!.address, input, files);
  res.status(201).json({ evidence: result });
}

const listQuery = z.object({
  campaignId: z.coerce.number().int().positive().optional(),
  milestoneId: z.coerce.number().int().nonnegative().optional(),
});

export async function list(req: Request, res: Response) {
  res.json({ evidence: await evidence.listEvidence(listQuery.parse(req.query)) });
}

export async function get(req: Request, res: Response) {
  res.json({ evidence: await evidence.getEvidence(String(req.params.id)) });
}

export async function integrity(req: Request, res: Response) {
  res.json(await evidence.checkIntegrity(String(req.params.id)));
}

export async function validateCid(req: Request, res: Response) {
  const ref = String(req.params.cid);
  const parsed = parseStorageRef(ref);
  res.json({
    ref,
    valid: !!parsed,
    kind: parsed?.kind ?? null,
    isIpfs: parsed?.kind === "ipfs",
    url: parsed ? storageUrl(ref) : null,
  });
}
