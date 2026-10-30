import type { Request, Response } from "express";
import { z } from "zod";
import { contractScope } from "../config/chain.js";
import { Campaign } from "../models/Campaign.js";
import { Evidence } from "../models/Evidence.js";
import { Verification } from "../models/Verification.js";
import { serializeEvidence } from "../services/campaignService.js";
import { addressSchema } from "../validators/schemas.js";

/** Milestones in PENDING_VERIFICATION for campaigns assigned to the signed-in verifier. */
export async function pending(req: Request, res: Response) {
  const { contractAddress } = contractScope();
  const me = req.auth!.address;
  const campaigns = await Campaign.find({ contractAddress, status: "ONCHAIN", "chain.verifier": me }).lean();
  const items = [];
  for (const c of campaigns) {
    for (const m of c.chain?.milestones ?? []) {
      if (m.status !== 1) continue;
      const ev = await Evidence.findOne({ contractAddress, campaignId: c.campaignId, milestoneId: m.id, status: "SUBMITTED" })
        .sort({ createdAt: -1 })
        .lean();
      items.push({
        campaignId: c.campaignId,
        campaignTitle: c.chain?.title ?? c.title,
        ngo: c.chain?.ngo,
        beneficiary: c.chain?.beneficiary,
        milestoneId: m.id,
        description: m.description,
        amountWei: m.allocatedAmount,
        evidenceCID: m.evidenceCID,
        evidenceHash: m.evidenceHash,
        submittedAt: m.submittedAt ? new Date(m.submittedAt * 1000) : null,
        escrowWei: (BigInt(c.chain?.totalDonated ?? "0") - BigInt(c.chain?.totalReleased ?? "0")).toString(),
        evidence: ev ? serializeEvidence(ev) : null,
      });
    }
  }
  items.sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0));
  res.json({ items });
}

/** Milestones approved but not yet released, for campaigns assigned to the signed-in verifier. */
export async function awaitingRelease(req: Request, res: Response) {
  const { contractAddress } = contractScope();
  const campaigns = await Campaign.find({ contractAddress, status: "ONCHAIN", "chain.verifier": req.auth!.address }).lean();
  const items = campaigns.flatMap((c) =>
    (c.chain?.milestones ?? [])
      .filter((m) => m.status === 2)
      .map((m) => ({
        campaignId: c.campaignId,
        campaignTitle: c.chain?.title ?? c.title,
        milestoneId: m.id,
        description: m.description,
        amountWei: m.allocatedAmount,
        escrowWei: (BigInt(c.chain?.totalDonated ?? "0") - BigInt(c.chain?.totalReleased ?? "0")).toString(),
        beneficiary: c.chain?.beneficiary,
      })),
  );
  res.json({ items });
}

const historyQuery = z.object({
  verifier: addressSchema.optional(),
  campaignId: z.coerce.number().int().positive().optional(),
});

export async function history(req: Request, res: Response) {
  const q = historyQuery.parse(req.query);
  const { contractAddress } = contractScope();
  const filter: Record<string, unknown> = { contractAddress };
  if (q.verifier) filter.verifier = q.verifier;
  if (q.campaignId) filter.campaignId = q.campaignId;
  const records = await Verification.find(filter).sort({ blockNumber: -1, logIndex: -1 }).limit(500).lean();
  const ids = [...new Set(records.map((r) => r.campaignId))];
  const campaigns = await Campaign.find({ contractAddress, campaignId: { $in: ids } }, { campaignId: 1, title: 1, "chain.title": 1, "chain.milestones": 1 }).lean();
  const byId = new Map(campaigns.map((c) => [c.campaignId, c]));
  res.json({
    records: records.map((r) => {
      const c = byId.get(r.campaignId);
      return {
        ...r,
        campaignTitle: c?.chain?.title ?? c?.title ?? null,
        milestoneDescription: c?.chain?.milestones?.find((m) => m.id === r.milestoneId)?.description ?? null,
      };
    }),
  });
}
