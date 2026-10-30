import type { Request, Response } from "express";
import { chainConfig, checkChain, contractScope, getContract, getProvider } from "../config/chain.js";
import { Campaign } from "../models/Campaign.js";
import { ChainEvent } from "../models/ChainEvent.js";
import { indexerStatus } from "../services/indexerService.js";
import { storageStatus } from "../services/ipfsService.js";
import { verifyAndIndexTx } from "../services/txVerificationService.js";
import { TX_HASH_RE } from "../utils/chain.js";
import { badRequest, unavailable } from "../utils/errors.js";
import { addressSchema, syncTxSchema, transactionsQuery } from "../validators/schemas.js";

export function config(_req: Request, res: Response) {
  res.json({ chainId: chainConfig.chainId, contractAddress: chainConfig.contractAddress, deployBlock: chainConfig.deployBlock, storage: storageStatus() });
}

export async function status(_req: Request, res: Response) {
  res.json({ chain: await checkChain(), indexer: indexerStatus(), storage: storageStatus() });
}

/** Verify a just-mined transaction against the chain and index its events immediately. */
export async function syncTx(req: Request, res: Response) {
  const { txHash } = syncTxSchema.parse(req.body);
  res.json(await verifyAndIndexTx(txHash));
}

export async function transactions(req: Request, res: Response) {
  const q = transactionsQuery.parse(req.query);
  const filter: Record<string, unknown> = { contractAddress: contractScope().contractAddress };
  if (q.campaignId) filter.campaignId = q.campaignId;
  if (q.address) filter.$or = [{ actor: q.address }, { subject: q.address }];
  if (q.event) filter.event = q.event;
  const events = await ChainEvent.find(filter).sort({ blockNumber: -1, logIndex: -1 }).limit(q.limit).lean();
  res.json({ events });
}

/** Transaction detail: live receipt from the RPC plus decoded TrustChain events from the index. */
export async function tx(req: Request, res: Response) {
  const hash = String(req.params.hash);
  if (!TX_HASH_RE.test(hash)) throw badRequest("Invalid transaction hash");
  const events = await ChainEvent.find({ contractAddress: contractScope().contractAddress, txHash: hash.toLowerCase() })
    .sort({ logIndex: 1 })
    .lean();
  let receipt = null;
  try {
    const r = await getProvider().getTransactionReceipt(hash);
    if (r) {
      receipt = {
        status: r.status === 1 ? "success" : "reverted",
        blockNumber: r.blockNumber,
        from: r.from.toLowerCase(),
        to: r.to?.toLowerCase() ?? null,
        gasUsed: r.gasUsed.toString(),
        toTrustChain: r.to?.toLowerCase() === chainConfig.contractAddress?.toLowerCase(),
      };
    }
  } catch {
    // RPC unavailable: still return indexed events.
  }
  res.json({ hash: hash.toLowerCase(), receipt, events });
}

/** Donation history for a wallet: indexed DonationReceived events + live per-campaign totals from the contract. */
export async function donations(req: Request, res: Response) {
  const donor = addressSchema.parse(req.query.donor);
  const { contractAddress } = contractScope();
  const events = await ChainEvent.find({ contractAddress, event: "DonationReceived", actor: donor })
    .sort({ blockNumber: -1, logIndex: -1 })
    .lean();
  const ids = [...new Set(events.map((e) => e.campaignId!))];
  const campaigns = await Campaign.find({ contractAddress, campaignId: { $in: ids } }).lean();
  const byId = new Map(campaigns.map((c) => [c.campaignId, c]));

  let contract;
  try {
    contract = getContract();
  } catch {
    throw unavailable("Blockchain unavailable");
  }
  const totals = await Promise.all(
    ids.map(async (id) => {
      const c = byId.get(id);
      let contributedWei: string | null = null;
      try {
        contributedWei = ((await contract.getDonation(id, donor)) as bigint).toString();
      } catch {
        contributedWei = null; // RPC failure: UI shows the indexed sum instead
      }
      const milestones = c?.chain?.milestones ?? [];
      return {
        campaignId: id,
        title: c?.chain?.title ?? c?.title ?? `Campaign #${id}`,
        contributedWei,
        indexedContributedWei: events.filter((e) => e.campaignId === id).reduce((s, e) => s + BigInt(e.amountWei ?? "0"), 0n).toString(),
        targetWei: c?.chain?.targetAmount ?? "0",
        totalDonatedWei: c?.chain?.totalDonated ?? "0",
        totalReleasedWei: c?.chain?.totalReleased ?? "0",
        milestonesReleased: milestones.filter((m) => m.status === 4).length,
        milestoneCount: milestones.length,
      };
    }),
  );
  res.json({ donor, events, totals });
}
