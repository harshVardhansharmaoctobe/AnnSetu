import { contractScope, getContract } from "../config/chain.js";
import { Campaign } from "../models/Campaign.js";
import { ChainEvent } from "../models/ChainEvent.js";
import { Evidence } from "../models/Evidence.js";
import { User } from "../models/User.js";
import { HttpError, badRequest, notFound } from "../utils/errors.js";
import { MILESTONE_STATUS, sameAddress } from "../utils/chain.js";
import { logger } from "../utils/logger.js";
import { refreshCampaign } from "./indexerService.js";
import { storageUrl, uploadBuffer, uploadJson, type StoredObject } from "./ipfsService.js";
import { getRoles } from "./roleService.js";

type CampaignRecord = InstanceType<typeof Campaign>;

export interface DraftInput {
  title: string;
  description: string;
  beneficiary: string;
  verifier: string;
  targetWei: bigint;
  endDate: Date;
  milestones: { description: string; amountWei: bigint }[];
}

export async function createDraft(ngoAddress: string, input: DraftInput, cover?: { buffer: Buffer; name: string; mime: string }) {
  // Mirror the contract's checks so the NGO is told about problems before paying gas.
  const verifierRoles = await getRoles(input.verifier);
  if (!verifierRoles.isVerifier) throw badRequest("Selected verifier is not an authorised verifier on-chain");
  if (sameAddress(input.verifier, ngoAddress) || sameAddress(input.verifier, input.beneficiary)) {
    throw badRequest("The verifier cannot be the NGO or the beneficiary (conflict of interest)");
  }

  let coverImage: StoredObject | null = null;
  if (cover) coverImage = await uploadBuffer(cover.buffer, cover.name, cover.mime);

  const metadataJson = {
    schema: "trustchain.campaign.v1",
    title: input.title,
    description: input.description,
    ngo: ngoAddress,
    beneficiary: input.beneficiary,
    verifier: input.verifier,
    targetWei: input.targetWei.toString(),
    endDate: input.endDate.toISOString(),
    coverImage: coverImage ? { ref: coverImage.ref, sha256: coverImage.sha256, mime: coverImage.mime } : null,
    milestones: input.milestones.map((m, index) => ({ index, description: m.description, amountWei: m.amountWei.toString() })),
    preparedAt: new Date().toISOString(),
  };
  const { stored: metadata } = await uploadJson(metadataJson, `trustchain-campaign-${Date.now()}.json`);

  const doc = await Campaign.create({
    ...contractScope(),
    status: "DRAFT",
    ngoAddress,
    title: input.title,
    description: input.description,
    coverImage,
    beneficiary: input.beneficiary,
    verifier: input.verifier,
    targetWei: input.targetWei.toString(),
    endDate: input.endDate,
    milestones: input.milestones.map((m) => ({ description: m.description, amountWei: m.amountWei.toString() })),
    metadata,
  });

  return {
    draftId: String(doc._id),
    metadata: { ...metadata, url: storageUrl(metadata.ref), isIpfs: metadata.provider !== "local" },
    // Exact arguments for TrustChain.createCampaign, signed by the NGO's wallet in the browser.
    contractArgs: {
      title: input.title,
      metadataCID: metadata.ref,
      beneficiary: input.beneficiary,
      verifier: input.verifier,
      targetAmount: input.targetWei.toString(),
      deadline: Math.floor(input.endDate.getTime() / 1000),
      milestoneDescriptions: input.milestones.map((m) => m.description),
      milestoneAmounts: input.milestones.map((m) => m.amountWei.toString()),
    },
  };
}

async function profiles(addresses: (string | null | undefined)[]) {
  const unique = [...new Set(addresses.filter(Boolean).map((a) => a!.toLowerCase()))];
  const users = await User.find({ address: { $in: unique } }).lean();
  return new Map(users.map((u) => [u.address, { name: u.name, organization: u.organization ?? null, isDemo: u.isDemo }]));
}

async function donationStats(campaignIds: number[]) {
  const { contractAddress } = contractScope();
  const rows = await ChainEvent.aggregate<{ _id: number; donations: number; donors: string[] }>([
    { $match: { contractAddress, event: "DonationReceived", campaignId: { $in: campaignIds } } },
    { $group: { _id: "$campaignId", donations: { $sum: 1 }, donors: { $addToSet: "$actor" } } },
  ]);
  return new Map(rows.map((r) => [r._id, { donationCount: r.donations, donorCount: r.donors.length }]));
}

function party(address: string | null | undefined, people: Awaited<ReturnType<typeof profiles>>) {
  if (!address) return null;
  const p = people.get(address.toLowerCase());
  return { address: address.toLowerCase(), name: p?.name ?? null, organization: p?.organization ?? null };
}

export function serializeCampaign(
  doc: CampaignRecord,
  people: Awaited<ReturnType<typeof profiles>>,
  stats?: { donationCount: number; donorCount: number },
) {
  const chain = doc.chain;
  const donated = BigInt(chain?.totalDonated ?? "0");
  const released = BigInt(chain?.totalReleased ?? "0");
  const deadline = chain?.deadline ? new Date(chain.deadline * 1000) : doc.endDate ?? null;
  const ts = (v?: number | null) => (v ? new Date(v * 1000).toISOString() : null);

  return {
    id: doc.campaignId,
    draftId: String(doc._id),
    status: doc.status,
    title: chain?.title ?? doc.title,
    description: doc.description,
    metadataAvailable: doc.metadataAvailable,
    coverImage: doc.coverImage
      ? { ref: doc.coverImage.ref, provider: doc.coverImage.provider, url: storageUrl(doc.coverImage.ref), isIpfs: doc.coverImage.provider !== "local" }
      : null,
    metadata: chain?.metadataCID
      ? { ref: chain.metadataCID, url: storageUrl(chain.metadataCID), isIpfs: !chain.metadataCID.startsWith("local://") }
      : doc.metadata
        ? { ref: doc.metadata.ref, url: storageUrl(doc.metadata.ref), isIpfs: doc.metadata.provider !== "local" }
        : null,
    ngo: party(chain?.ngo ?? doc.ngoAddress, people),
    beneficiary: party(chain?.beneficiary ?? doc.beneficiary, people),
    verifier: party(chain?.verifier ?? doc.verifier, people),
    targetWei: chain?.targetAmount ?? doc.targetWei ?? "0",
    totalAllocatedWei: chain?.totalAllocated ?? "0",
    totalDonatedWei: donated.toString(),
    totalReleasedWei: released.toString(),
    escrowWei: (donated - released).toString(),
    active: chain?.active ?? false,
    suspended: chain?.suspended ?? false,
    deadline: deadline ? new Date(deadline).toISOString() : null,
    ended: deadline ? new Date(deadline).getTime() < Date.now() : false,
    createdAt: chain?.createdAt ? ts(chain.createdAt) : doc.createdAt?.toISOString?.() ?? null,
    createdTxHash: doc.createdTxHash,
    donationCount: stats?.donationCount ?? 0,
    donorCount: stats?.donorCount ?? 0,
    milestones: chain
      ? chain.milestones.map((m) => ({
          id: m.id!,
          description: m.description ?? "",
          amountWei: m.allocatedAmount ?? "0",
          status: MILESTONE_STATUS[m.status ?? 0],
          evidenceCID: m.evidenceCID || null,
          evidenceHash: m.evidenceHash && !/^0x0+$/.test(m.evidenceHash) ? m.evidenceHash : null,
          evidenceUrl: m.evidenceCID ? storageUrl(m.evidenceCID) : null,
          evidenceIsIpfs: m.evidenceCID ? !m.evidenceCID.startsWith("local://") : null,
          rejectionReason: m.rejectionReason || null,
          submittedAt: ts(m.submittedAt),
          reviewedAt: ts(m.reviewedAt),
          releasedAt: ts(m.releasedAt),
        }))
      : doc.milestones.map((m, i) => ({
          id: i,
          description: m.description,
          amountWei: m.amountWei,
          status: "DRAFT" as const,
          evidenceCID: null,
          evidenceHash: null,
          evidenceUrl: null,
          evidenceIsIpfs: null,
          rejectionReason: null,
          submittedAt: null,
          reviewedAt: null,
          releasedAt: null,
        })),
    isDemo: doc.isDemo,
    syncedAt: chain?.syncedAt ?? null,
    syncedBlock: chain?.syncedBlock ?? null,
  };
}

export type SerializedCampaign = ReturnType<typeof serializeCampaign>;

async function serializeMany(docs: CampaignRecord[]) {
  const people = await profiles(docs.flatMap((d) => [d.chain?.ngo ?? d.ngoAddress, d.chain?.beneficiary ?? d.beneficiary, d.chain?.verifier ?? d.verifier]));
  const ids = docs.map((d) => d.campaignId).filter((v): v is number => typeof v === "number");
  const stats = await donationStats(ids);
  return docs.map((d) => serializeCampaign(d, people, d.campaignId != null ? stats.get(d.campaignId) : undefined));
}

export async function listCampaigns(filter: { ngo?: string; verifier?: string; q?: string; state?: string }) {
  const query: Record<string, unknown> = { ...contractScope(), status: "ONCHAIN" };
  if (filter.ngo) query["chain.ngo"] = filter.ngo;
  if (filter.verifier) query["chain.verifier"] = filter.verifier;
  if (filter.q) query.title = { $regex: filter.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const docs = await Campaign.find(query).sort({ campaignId: -1 }).limit(200);
  let list = await serializeMany(docs);
  if (filter.state === "active") list = list.filter((c) => c.active && !c.ended);
  if (filter.state === "ended") list = list.filter((c) => !c.active || c.ended);
  return list;
}

export async function listNgoCampaigns(ngoAddress: string) {
  const docs = await Campaign.find({ ...contractScope(), ngoAddress }).sort({ createdAt: -1 });
  return serializeMany(docs);
}

export async function getDraft(draftId: string, ngoAddress: string) {
  const doc = await Campaign.findOne({ _id: draftId, ...contractScope() }).catch(() => null);
  if (!doc || doc.ngoAddress !== ngoAddress) throw notFound("Draft not found");
  return (await serializeMany([doc]))[0];
}

/** Campaign detail with balances read live from the contract (falls back to the index if the RPC is down). */
export async function getCampaignDetail(campaignId: number) {
  const scope = contractScope();
  let source: "chain" | "index" = "chain";
  try {
    await refreshCampaign(campaignId);
  } catch (err) {
    const e = err as { code?: string; status?: number };
    if (e.code === "CALL_EXCEPTION") throw notFound(`Campaign #${campaignId} does not exist on-chain`);
    logger.warn("campaigns", `Live read of campaign ${campaignId} failed; serving indexed snapshot`, err);
    source = "index";
  }
  const doc = await Campaign.findOne({ contractAddress: scope.contractAddress, campaignId });
  if (!doc) {
    if (source === "index") throw new HttpError(503, "Blockchain unavailable and campaign not indexed yet", "SERVICE_UNAVAILABLE");
    throw notFound(`Campaign #${campaignId} not found`);
  }
  const [campaign] = await serializeMany([doc]);

  const evidence = await Evidence.find({ contractAddress: scope.contractAddress, campaignId, status: { $ne: "UPLOADED" } })
    .sort({ createdAt: -1 })
    .lean();
  const evidenceByMilestone = new Map<number, unknown[]>();
  for (const e of evidence) {
    const list = evidenceByMilestone.get(e.milestoneId) ?? [];
    list.push(serializeEvidence(e));
    evidenceByMilestone.set(e.milestoneId, list);
  }
  return {
    ...campaign,
    source,
    milestones: campaign.milestones.map((m) => ({ ...m, evidence: evidenceByMilestone.get(m.id) ?? [] })),
  };
}

export function serializeEvidence(e: {
  _id: unknown;
  campaignId: number;
  milestoneId: number;
  ngoAddress: string;
  note?: string | null;
  files: { name: string; mime: string; size: number; sha256: string; ref: string; provider: string }[];
  provider: string;
  manifestRef: string;
  manifestSha256: string;
  status: string;
  submitTxHash?: string | null;
  submittedAt?: Date | null;
  reviewTxHash?: string | null;
  rejectionReason?: string | null;
  createdAt?: Date;
}) {
  return {
    id: String(e._id),
    campaignId: e.campaignId,
    milestoneId: e.milestoneId,
    ngoAddress: e.ngoAddress,
    note: e.note ?? "",
    provider: e.provider,
    isIpfs: e.provider !== "local",
    manifest: { ref: e.manifestRef, sha256: e.manifestSha256, url: storageUrl(e.manifestRef) },
    files: e.files.map((f) => ({ ...f, url: storageUrl(f.ref) })),
    status: e.status,
    submitTxHash: e.submitTxHash ?? null,
    submittedAt: e.submittedAt ?? null,
    reviewTxHash: e.reviewTxHash ?? null,
    rejectionReason: e.rejectionReason ?? null,
    createdAt: e.createdAt ?? null,
  };
}

/** Live on-chain read used by evidence upload and verification checks. */
export async function readOnChainCampaign(campaignId: number) {
  try {
    const contract = getContract();
    const [c, ms] = await Promise.all([contract.getCampaign(campaignId), contract.getMilestones(campaignId)]);
    // Plain array: indexing an ethers Result out of range throws instead of returning undefined.
    const milestones = Array.from(ms as Iterable<unknown>) as Array<{ status: bigint; allocatedAmount: bigint; description: string }>;
    return { campaign: c, milestones };
  } catch (err) {
    if ((err as { code?: string }).code === "CALL_EXCEPTION") throw notFound(`Campaign #${campaignId} does not exist on-chain`);
    if (err instanceof HttpError) throw err;
    throw new HttpError(503, "Blockchain is unavailable — cannot read the campaign right now", "SERVICE_UNAVAILABLE");
  }
}
