import { contractScope } from "../config/chain.js";
import { Campaign } from "../models/Campaign.js";
import { ChainEvent } from "../models/ChainEvent.js";
import { User } from "../models/User.js";
import { getRoles } from "./roleService.js";

type Kind = "NGO" | "VERIFIER";
const EVENTS: Record<Kind, [string, string]> = {
  NGO: ["NGORegistered", "NGORevoked"],
  VERIFIER: ["VerifierRegistered", "VerifierRevoked"],
};

/** Currently authorised accounts, folded from the indexed registration/revocation events. */
export async function listAuthorized(kind: Kind) {
  const [granted, revoked] = EVENTS[kind];
  const events = await ChainEvent.find({ contractAddress: contractScope().contractAddress, event: { $in: [granted, revoked] } })
    .sort({ blockNumber: 1, logIndex: 1 })
    .lean();
  const current = new Map<string, { since: Date; txHash: string }>();
  for (const e of events) {
    if (!e.subject) continue;
    if (e.event === granted) current.set(e.subject, { since: e.blockTimestamp, txHash: e.txHash });
    else current.delete(e.subject);
  }
  const users = await User.find({ address: { $in: [...current.keys()] } }).lean();
  const byAddress = new Map(users.map((u) => [u.address, u]));
  return [...current.entries()].map(([address, info]) => {
    const u = byAddress.get(address);
    return {
      address,
      name: u?.name ?? null,
      organization: u?.organization ?? null,
      isDemo: u?.isDemo ?? false,
      authorizedAt: info.since,
      txHash: info.txHash,
    };
  });
}

/** Registered users who asked for NGO/verifier access, with their live on-chain status. */
export async function listApplications() {
  const users = await User.find({ requestedRole: { $in: ["NGO", "VERIFIER"] } }).sort({ createdAt: -1 }).lean();
  return Promise.all(
    users.map(async (u) => {
      const roles = await getRoles(u.address).catch(() => null);
      return {
        address: u.address,
        name: u.name,
        email: u.email ?? null,
        organization: u.organization ?? null,
        requestedRole: u.requestedRole,
        isDemo: u.isDemo,
        createdAt: u.createdAt,
        onChain: roles ? { isNGO: roles.isNGO, isVerifier: roles.isVerifier, isAdmin: roles.isAdmin } : null,
      };
    }),
  );
}

export async function platformOverview() {
  const { contractAddress } = contractScope();
  const campaigns = await Campaign.find({ contractAddress, status: "ONCHAIN" }, { chain: 1 }).lean();
  let donated = 0n;
  let released = 0n;
  let pendingReviews = 0;
  for (const c of campaigns) {
    donated += BigInt(c.chain?.totalDonated ?? "0");
    released += BigInt(c.chain?.totalReleased ?? "0");
    pendingReviews += (c.chain?.milestones ?? []).filter((m) => m.status === 1).length;
  }
  const [donations, donors, users, recentEvents, ngos, verifiers] = await Promise.all([
    ChainEvent.countDocuments({ contractAddress, event: "DonationReceived" }),
    ChainEvent.distinct("actor", { contractAddress, event: "DonationReceived" }),
    User.countDocuments(),
    ChainEvent.find({ contractAddress }).sort({ blockNumber: -1, logIndex: -1 }).limit(25).lean(),
    listAuthorized("NGO"),
    listAuthorized("VERIFIER"),
  ]);
  return {
    campaigns: campaigns.length,
    totalDonatedWei: donated.toString(),
    totalReleasedWei: released.toString(),
    escrowWei: (donated - released).toString(),
    donations,
    donors: donors.length,
    pendingReviews,
    users,
    ngos: ngos.length,
    verifiers: verifiers.length,
    recentEvents,
  };
}
