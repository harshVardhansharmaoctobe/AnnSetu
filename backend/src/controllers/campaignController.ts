import type { Request, Response } from "express";
import { contractScope } from "../config/chain.js";
import { ChainEvent } from "../models/ChainEvent.js";
import * as campaigns from "../services/campaignService.js";
import { IMAGE_EXTENSIONS, validateFile } from "../services/evidenceService.js";
import { badRequest } from "../utils/errors.js";
import { campaignDraftSchema, campaignIdParam, listCampaignsQuery } from "../validators/schemas.js";

export async function list(req: Request, res: Response) {
  const filter = listCampaignsQuery.parse(req.query);
  res.json({ campaigns: await campaigns.listCampaigns(filter) });
}

export async function mine(req: Request, res: Response) {
  res.json({ campaigns: await campaigns.listNgoCampaigns(req.auth!.address) });
}

export async function createDraft(req: Request, res: Response) {
  const input = campaignDraftSchema.parse(req.body);
  const file = req.file;
  let cover: { buffer: Buffer; name: string; mime: string } | undefined;
  if (file) {
    const { safeName } = validateFile(file, IMAGE_EXTENSIONS);
    cover = { buffer: file.buffer, name: safeName, mime: file.mimetype };
  }
  const result = await campaigns.createDraft(
    req.auth!.address,
    {
      title: input.title,
      description: input.description,
      beneficiary: input.beneficiary,
      verifier: input.verifier,
      targetWei: input.targetEth,
      endDate: input.endDate,
      milestones: input.milestones.map((m) => ({ description: m.description, amountWei: m.amountEth })),
    },
    cover,
  );
  res.status(201).json(result);
}

export async function getDraft(req: Request, res: Response) {
  res.json({ campaign: await campaigns.getDraft(String(req.params.draftId), req.auth!.address) });
}

export async function detail(req: Request, res: Response) {
  const id = campaignIdParam.parse(req.params.id);
  res.json({ campaign: await campaigns.getCampaignDetail(id) });
}

export async function events(req: Request, res: Response) {
  const id = campaignIdParam.parse(req.params.id);
  const type = typeof req.query.event === "string" ? req.query.event : undefined;
  if (type && !/^[A-Za-z]+$/.test(type)) throw badRequest("Invalid event filter");
  const docs = await ChainEvent.find({ contractAddress: contractScope().contractAddress, campaignId: id, ...(type ? { event: type } : {}) })
    .sort({ blockNumber: -1, logIndex: -1 })
    .limit(500)
    .lean();
  res.json({ events: docs });
}
