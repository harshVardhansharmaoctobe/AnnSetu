import type { Log } from "ethers";
import { chainConfig, checkChain, getContract, getProvider, trustChainInterface } from "../config/chain.js";
import { env } from "../config/env.js";
import { Campaign } from "../models/Campaign.js";
import { ChainEvent } from "../models/ChainEvent.js";
import { Evidence } from "../models/Evidence.js";
import { IndexerState } from "../models/IndexerState.js";
import { Verification } from "../models/Verification.js";
import { serializeBigInts } from "../utils/chain.js";
import { logger } from "../utils/logger.js";
import { invalidateRoles } from "./roleService.js";

const TRACKED_EVENTS = new Set([
  "NGORegistered",
  "NGORevoked",
  "VerifierRegistered",
  "VerifierRevoked",
  "CampaignCreated",
  "MilestoneCreated",
  "CampaignStatusChanged",
  "CampaignVerifierChanged",
  "DonationReceived",
  "EvidenceSubmitted",
  "MilestoneApproved",
  "MilestoneRejected",
  "FundsReleased",
]);

export interface IndexedEvent {
  event: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  campaignId: number | null;
  milestoneId: number | null;
}

const status = {
  running: false,
  lastBlock: null as number | null,
  latestBlock: null as number | null,
  lastSyncedAt: null as Date | null,
  lastError: null as string | null,
};
export const indexerStatus = () => ({ ...status, contractAddress: chainConfig.contractAddress, chainId: chainConfig.chainId });

// All log processing is serialised so the poll loop and /chain/sync-tx never race each other.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const blockTimes = new Map<number, Date>();
async function blockTimestamp(blockNumber: number): Promise<Date> {
  const cached = blockTimes.get(blockNumber);
  if (cached) return cached;
  const block = await getProvider().getBlock(blockNumber);
  const date = new Date(Number(block?.timestamp ?? Math.floor(Date.now() / 1000)) * 1000);
  if (blockTimes.size > 5000) blockTimes.clear();
  blockTimes.set(blockNumber, date);
  return date;
}

const scope = () => ({ chainId: chainConfig.chainId, contractAddress: chainConfig.contractAddress! });
const lc = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null);
const num = (v: unknown) => (v === undefined || v === null ? null : Number(v));

/** Map decoded event args onto the indexed columns used by queries. */
function describe(name: string, a: Record<string, unknown>) {
  switch (name) {
    case "NGORegistered":
    case "NGORevoked":
    case "VerifierRegistered":
    case "VerifierRevoked":
      return { actor: lc(a.admin), subject: lc(a.account) };
    case "CampaignCreated":
      return { campaignId: num(a.campaignId), actor: lc(a.ngo), subject: lc(a.beneficiary), amountWei: String(a.targetAmount) };
    case "MilestoneCreated":
      return { campaignId: num(a.campaignId), milestoneId: num(a.milestoneId), amountWei: String(a.allocatedAmount) };
    case "CampaignStatusChanged":
      return { campaignId: num(a.campaignId) };
    case "CampaignVerifierChanged":
      return { campaignId: num(a.campaignId), subject: lc(a.newVerifier) };
    case "DonationReceived":
      return { campaignId: num(a.campaignId), actor: lc(a.donor), amountWei: String(a.amount) };
    case "EvidenceSubmitted":
      return { campaignId: num(a.campaignId), milestoneId: num(a.milestoneId), actor: lc(a.ngo) };
    case "MilestoneApproved":
    case "MilestoneRejected":
      return { campaignId: num(a.campaignId), milestoneId: num(a.milestoneId), actor: lc(a.verifier) };
    case "FundsReleased":
      return {
        campaignId: num(a.campaignId),
        milestoneId: num(a.milestoneId),
        actor: lc(a.releasedBy),
        subject: lc(a.beneficiary),
        amountWei: String(a.amount),
      };
    default:
      return {};
  }
}

async function applySideEffects(name: string, a: Record<string, unknown>, log: Log, at: Date) {
  const s = scope();
  const campaignId = num(a.campaignId);
  const milestoneId = num(a.milestoneId);

  switch (name) {
    case "NGORegistered":
    case "NGORevoked":
    case "VerifierRegistered":
    case "VerifierRevoked":
      invalidateRoles(String(a.account));
      break;

    case "CampaignCreated":
      // Link the metadata draft prepared through the API (matched by NGO + metadata reference).
      await Campaign.updateOne(
        { ...s, status: "DRAFT", ngoAddress: lc(a.ngo), "metadata.ref": a.metadataCID },
        { $set: { campaignId, status: "ONCHAIN", createdTxHash: log.transactionHash.toLowerCase(), createdBlock: log.blockNumber } },
      );
      break;

    case "EvidenceSubmitted": {
      const matched = await Evidence.findOneAndUpdate(
        {
          ...s,
          campaignId,
          milestoneId,
          manifestRef: a.evidenceCID,
          manifestSha256: String(a.evidenceHash).toLowerCase(),
          status: { $in: ["UPLOADED", "SUBMITTED"] },
        },
        { $set: { status: "SUBMITTED", submitTxHash: log.transactionHash.toLowerCase(), submittedAt: at } },
        { new: true, sort: { createdAt: -1 } },
      );
      // Earlier evidence for this milestone is no longer the one under review.
      await Evidence.updateMany(
        { ...s, campaignId, milestoneId, status: { $in: ["UPLOADED", "SUBMITTED", "REJECTED"] }, ...(matched ? { _id: { $ne: matched._id } } : {}) },
        { $set: { status: "SUPERSEDED" } },
      );
      break;
    }

    case "MilestoneApproved":
    case "MilestoneRejected": {
      const approved = name === "MilestoneApproved";
      const submission = await ChainEvent.findOne({
        ...s,
        event: "EvidenceSubmitted",
        campaignId,
        milestoneId,
        $or: [{ blockNumber: { $lt: log.blockNumber } }, { blockNumber: log.blockNumber, logIndex: { $lt: log.index } }],
      }).sort({ blockNumber: -1, logIndex: -1 });
      await Verification.updateOne(
        { contractAddress: s.contractAddress, txHash: log.transactionHash.toLowerCase(), logIndex: log.index },
        {
          $setOnInsert: {
            ...s,
            campaignId,
            milestoneId,
            verifier: lc(a.verifier),
            decision: approved ? "APPROVED" : "REJECTED",
            reason: approved ? null : String(a.reason),
            evidenceCID: submission?.args?.evidenceCID ?? null,
            evidenceHash: submission?.args?.evidenceHash ?? null,
            blockNumber: log.blockNumber,
            decidedAt: at,
          },
        },
        { upsert: true },
      );
      await Evidence.updateOne(
        { ...s, campaignId, milestoneId, status: "SUBMITTED" },
        {
          $set: {
            status: approved ? "APPROVED" : "REJECTED",
            reviewTxHash: log.transactionHash.toLowerCase(),
            rejectionReason: approved ? null : String(a.reason),
          },
        },
      );
      break;
    }

    case "FundsReleased":
      await Evidence.updateOne({ ...s, campaignId, milestoneId, status: "APPROVED" }, { $set: { status: "RELEASED" } });
      break;
  }
}

/** Re-read a campaign from the contract and store the snapshot used for listings. */
export async function refreshCampaign(campaignId: number) {
  const s = scope();
  const contract = getContract();
  const [c, ms, block] = await Promise.all([
    contract.getCampaign(campaignId),
    contract.getMilestones(campaignId),
    getProvider().getBlockNumber(),
  ]);
  const snapshot = {
    ngo: String(c.ngo).toLowerCase(),
    beneficiary: String(c.beneficiary).toLowerCase(),
    verifier: String(c.verifier).toLowerCase(),
    title: c.title,
    metadataCID: c.metadataCID,
    targetAmount: c.targetAmount.toString(),
    totalAllocated: c.totalAllocated.toString(),
    totalDonated: c.totalDonated.toString(),
    totalReleased: c.totalReleased.toString(),
    deadline: Number(c.deadline),
    createdAt: Number(c.createdAt),
    milestoneCount: Number(c.milestoneCount),
    active: c.active,
    suspended: c.suspended,
    milestones: (ms as unknown as Array<Record<string, unknown>>).map((m) => ({
      id: Number(m.id),
      description: String(m.description),
      allocatedAmount: String(m.allocatedAmount),
      evidenceCID: String(m.evidenceCID),
      evidenceHash: String(m.evidenceHash),
      status: Number(m.status),
      rejectionReason: String(m.rejectionReason),
      submittedAt: Number(m.submittedAt),
      reviewedAt: Number(m.reviewedAt),
      releasedAt: Number(m.releasedAt),
    })),
    syncedAt: new Date(),
    syncedBlock: block,
  };
  await Campaign.updateOne(
    { contractAddress: s.contractAddress, campaignId },
    {
      $set: { chain: snapshot, status: "ONCHAIN" },
      $setOnInsert: {
        chainId: s.chainId,
        ngoAddress: snapshot.ngo,
        title: snapshot.title,
        beneficiary: snapshot.beneficiary,
        verifier: snapshot.verifier,
        metadataAvailable: false, // created outside this app's API: no off-chain metadata
      },
    },
    { upsert: true },
  );
}

/** Decode and store TrustChain logs, apply projections, refresh affected campaigns. Idempotent. */
export function processLogs(logs: readonly Log[]): Promise<IndexedEvent[]> {
  return serial(async () => {
    const s = scope();
    const out: IndexedEvent[] = [];
    const touched = new Set<number>();
    const sorted = [...logs].sort((x, y) => x.blockNumber - y.blockNumber || x.index - y.index);

    for (const log of sorted) {
      if (log.address.toLowerCase() !== s.contractAddress.toLowerCase()) continue;
      const parsed = trustChainInterface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed || !TRACKED_EVENTS.has(parsed.name)) continue;

      const args = serializeBigInts(parsed.args.toObject()) as Record<string, unknown>;
      const at = await blockTimestamp(log.blockNumber);
      const columns = describe(parsed.name, parsed.args.toObject());

      await ChainEvent.updateOne(
        { contractAddress: s.contractAddress, txHash: log.transactionHash.toLowerCase(), logIndex: log.index },
        {
          $setOnInsert: {
            chainId: s.chainId,
            blockNumber: log.blockNumber,
            blockTimestamp: at,
            event: parsed.name,
            args,
            ...columns,
          },
        },
        { upsert: true },
      );
      await applySideEffects(parsed.name, args, log, at);

      const campaignId = num(args.campaignId);
      if (campaignId !== null) touched.add(campaignId);
      out.push({
        event: parsed.name,
        txHash: log.transactionHash.toLowerCase(),
        logIndex: log.index,
        blockNumber: log.blockNumber,
        campaignId,
        milestoneId: num(args.milestoneId),
      });
    }

    for (const id of touched) await refreshCampaign(id);
    return out;
  });
}

/** Delete everything indexed for this contract (used when a local chain was reset). */
async function purgeContractData(contractAddress: string) {
  await Promise.all([
    ChainEvent.deleteMany({ contractAddress }),
    Verification.deleteMany({ contractAddress }),
    Evidence.deleteMany({ contractAddress }),
    Campaign.deleteMany({ contractAddress }),
    IndexerState.deleteMany({ contractAddress }),
  ]);
}

async function loadState() {
  const s = scope();
  const provider = getProvider();
  const startBlock = chainConfig.deployBlock;
  let state = await IndexerState.findOne({ contractAddress: s.contractAddress });
  const latest = await provider.getBlockNumber();
  const startHash = (await provider.getBlock(startBlock))?.hash ?? null;

  if (state && (state.startBlockHash !== startHash || state.lastBlock > latest || state.chainId !== s.chainId)) {
    logger.warn("indexer", "Chain history changed (local node restarted?) — purging indexed data for this contract");
    await purgeContractData(s.contractAddress);
    state = null;
  }
  if (!state) {
    if (!startHash) throw new Error(`Start block ${startBlock} not found on chain`);
    state = await IndexerState.create({ ...s, startBlock, startBlockHash: startHash, lastBlock: startBlock - 1 });
  }
  return state;
}

/** Index all new blocks once. Returns the number of TrustChain events processed. */
export async function syncOnce(): Promise<number> {
  const state = await loadState();
  const provider = getProvider();
  const head = (await provider.getBlockNumber()) - env.INDEXER_CONFIRMATIONS;
  status.latestBlock = head;
  let from = state.lastBlock + 1;
  let processed = 0;

  while (from <= head) {
    const to = Math.min(from + env.INDEXER_BLOCK_CHUNK - 1, head);
    const logs = await provider.getLogs({ address: chainConfig.contractAddress!, fromBlock: from, toBlock: to });
    processed += (await processLogs(logs)).length;
    await IndexerState.updateOne({ _id: state._id }, { $set: { lastBlock: to, lastSyncedAt: new Date() } });
    status.lastBlock = to;
    from = to + 1;
  }
  status.lastSyncedAt = new Date();
  status.lastError = null;
  return processed;
}

let timer: NodeJS.Timeout | null = null;

export async function startIndexer() {
  if (status.running) return;
  if (!chainConfig.contractAddress) {
    logger.warn("indexer", "No contract address configured — indexer not started");
    return;
  }
  if (chainConfig.deployBlock === 0 && chainConfig.chainId !== 31337) {
    logger.warn("indexer", "CONTRACT_DEPLOY_BLOCK is not set — indexing from block 0 may take a long time");
  }
  status.running = true;

  const tick = async () => {
    try {
      const check = await checkChain();
      if (!check.ok) throw new Error(check.reason);
      const n = await syncOnce();
      if (n > 0) logger.info("indexer", `Indexed ${n} event(s) up to block ${status.lastBlock}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message !== status.lastError) logger.warn("indexer", `Sync failed: ${message}`);
      status.lastError = message;
    } finally {
      if (status.running) timer = setTimeout(tick, env.INDEXER_POLL_MS);
    }
  };
  await tick();
}

export function stopIndexer() {
  status.running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
