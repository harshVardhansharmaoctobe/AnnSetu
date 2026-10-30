import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import { ZeroHash } from "ethers";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { syncOnce } from "../src/services/indexerService.js";
import { ChainEvent } from "../src/models/ChainEvent.js";
import { Verification } from "../src/models/Verification.js";
import { ETH, JPG, PDF, PNG, accounts, contractAs, draftFields, ensureRoles, provider, signIn } from "./helpers.js";

let app: Express;
let acc: Awaited<ReturnType<typeof accounts>>;
const addr: Record<string, string> = {};
const tokens: Record<string, string> = {};
let campaignId: number;

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function sendAndSync(txPromise: Promise<{ wait: () => Promise<{ hash: string } | null> }>) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  const res = await request(app).post("/api/chain/sync-tx").send({ txHash: receipt!.hash });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

beforeAll(async () => {
  await connectDb(process.env.MONGODB_URI!);
  app = createApp();
  acc = await accounts();
  for (const [k, s] of Object.entries(acc)) addr[k] = (await s.getAddress()).toLowerCase();
  await ensureRoles();
  tokens.admin = await signIn(app, acc.admin, { name: "Platform Admin" });
  tokens.ngo = await signIn(app, acc.ngo, { name: "Hope Builders Foundation", requestedRole: "NGO" });
  tokens.ngo2 = await signIn(app, acc.ngo2, { name: "Other NGO", requestedRole: "NGO" });
  tokens.verifier = await signIn(app, acc.verifier, { name: "Independent Auditor", requestedRole: "VERIFIER" });
  tokens.verifier2 = await signIn(app, acc.verifier2, { name: "Second Auditor", requestedRole: "VERIFIER" });
  tokens.donor = await signIn(app, acc.donor, { name: "Alice Donor" });
});

afterAll(async () => {
  await disconnectDb();
  provider.destroy();
});

describe("health & config", () => {
  it("reports health and chain/indexer status", async () => {
    const health = await request(app).get("/api/health").expect(200);
    expect(health.body).toEqual({ status: "ok", db: "connected" });
    const status = await request(app).get("/api/chain/status").expect(200);
    expect(status.body.chain.ok).toBe(true);
    expect(status.body.storage).toMatchObject({ provider: "local", configured: true, isIpfs: false });
  });

  it("returns 404 JSON for unknown routes", async () => {
    const res = await request(app).get("/api/nope").expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("wallet authentication", () => {
  it("rejects invalid addresses", async () => {
    const res = await request(app).post("/api/auth/nonce").send({ address: "0x123" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a signature from a different wallet", async () => {
    const { outsider, beneficiary } = acc;
    const nonce = await request(app).post("/api/auth/nonce").send({ address: addr.outsider }).expect(200);
    const forged = await beneficiary.signMessage(nonce.body.message);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ address: await outsider.getAddress(), signature: forged, name: "Mallory" })
      .expect(401);
    expect(res.body.error.message).toMatch(/does not match/);
  });

  it("does not allow a nonce signature to be replayed", async () => {
    const nonce = await request(app).post("/api/auth/nonce").send({ address: addr.donor }).expect(200);
    const signature = await acc.donor.signMessage(nonce.body.message);
    await request(app).post("/api/auth/login").send({ address: addr.donor, signature }).expect(200);
    await request(app).post("/api/auth/login").send({ address: addr.donor, signature }).expect(401);
  });

  it("refuses duplicate registration and unknown-wallet login", async () => {
    const nonce = await request(app).post("/api/auth/nonce").send({ address: addr.donor }).expect(200);
    const signature = await acc.donor.signMessage(nonce.body.message);
    await request(app).post("/api/auth/register").send({ address: addr.donor, signature, name: "Again" }).expect(409);

    const n2 = await request(app).post("/api/auth/nonce").send({ address: addr.beneficiary }).expect(200);
    const sig2 = await acc.beneficiary.signMessage(n2.body.message);
    await request(app).post("/api/auth/login").send({ address: addr.beneficiary, signature: sig2 }).expect(404);
  });

  it("returns roles read from the contract", async () => {
    const donor = await request(app).get("/api/auth/me").set(auth(tokens.donor)).expect(200);
    expect(donor.body.roles.roles).toEqual(["DONOR"]);
    const ngo = await request(app).get("/api/auth/me").set(auth(tokens.ngo)).expect(200);
    expect(ngo.body.roles.isNGO).toBe(true);
    expect(ngo.body.user.requestedRole).toBe("NGO");
    const admin = await request(app).get("/api/auth/me").set(auth(tokens.admin)).expect(200);
    expect(admin.body.roles.isAdmin).toBe(true);
  });

  it("rejects missing and tampered tokens", async () => {
    await request(app).get("/api/auth/me").expect(401);
    await request(app).get("/api/auth/me").set(auth(tokens.donor + "x")).expect(401);
  });

  it("ignores the requested role when authorising (NGO applicant without on-chain role)", async () => {
    const token = await signIn(app, acc.outsider, { name: "Wannabe NGO", requestedRole: "NGO" });
    await request(app).get("/api/campaigns/mine").set(auth(token)).expect(403);
    tokens.outsider = token;
  });
});

describe("admin endpoints", () => {
  it("are restricted to the on-chain admin", async () => {
    await request(app).get("/api/admin/overview").set(auth(tokens.donor)).expect(403);
    await request(app).get("/api/admin/overview").set(auth(tokens.ngo)).expect(403);
    const res = await request(app).get("/api/admin/applications").set(auth(tokens.admin)).expect(200);
    const outsider = res.body.applications.find((a: { address: string }) => a.address === addr.outsider);
    expect(outsider).toMatchObject({ requestedRole: "NGO", onChain: { isNGO: false } });
  });

  it("lists authorised NGOs and verifiers from indexed role events", async () => {
    await syncOnce();
    const ngos = await request(app).get("/api/directory/ngos").expect(200);
    expect(ngos.body.accounts.map((a: { address: string }) => a.address)).toEqual(expect.arrayContaining([addr.ngo, addr.ngo2]));
    const verifiers = await request(app).get("/api/directory/verifiers").expect(200);
    const v = verifiers.body.accounts.find((a: { address: string }) => a.address === addr.verifier);
    expect(v).toMatchObject({ name: "Independent Auditor" });
  });
});

describe("campaign drafts and creation", () => {
  it("blocks non-NGOs from creating drafts", async () => {
    await request(app)
      .post("/api/campaigns/drafts")
      .set(auth(tokens.donor))
      .field(draftFields({ beneficiary: addr.beneficiary, verifier: addr.verifier }))
      .expect(403);
  });

  it("validates milestone totals, verifier eligibility and cover image type", async () => {
    const mismatch = await request(app)
      .post("/api/campaigns/drafts")
      .set(auth(tokens.ngo))
      .field(draftFields({ beneficiary: addr.beneficiary, verifier: addr.verifier, target: "1" }))
      .expect(400);
    expect(mismatch.body.error.message).toMatch(/add up exactly/);

    const notVerifier = await request(app)
      .post("/api/campaigns/drafts")
      .set(auth(tokens.ngo))
      .field(draftFields({ beneficiary: addr.beneficiary, verifier: addr.outsider }))
      .expect(400);
    expect(notVerifier.body.error.message).toMatch(/not an authorised verifier/);

    const conflictOfInterest = await request(app)
      .post("/api/campaigns/drafts")
      .set(auth(tokens.ngo))
      .field(draftFields({ beneficiary: addr.verifier, verifier: addr.verifier }))
      .expect(400);
    expect(conflictOfInterest.body.error.message).toMatch(/conflict of interest/);

    const badCover = await request(app)
      .post("/api/campaigns/drafts")
      .set(auth(tokens.ngo))
      .field(draftFields({ beneficiary: addr.beneficiary, verifier: addr.verifier }))
      .attach("cover", Buffer.from("not really an image"), { filename: "cover.png", contentType: "image/png" })
      .expect(400);
    expect(badCover.body.error.message).toMatch(/not a valid PNG/);

    const pdfCover = await request(app)
      .post("/api/campaigns/drafts")
      .set(auth(tokens.ngo))
      .field(draftFields({ beneficiary: addr.beneficiary, verifier: addr.verifier }))
      .attach("cover", PDF, { filename: "cover.pdf", contentType: "application/pdf" })
      .expect(400);
    expect(pdfCover.body.error.message).toMatch(/not allowed/);
  });

  it("creates a draft, then links it to the on-chain campaign after a verified transaction", async () => {
    const draft = await request(app)
      .post("/api/campaigns/drafts")
      .set(auth(tokens.ngo))
      .field(draftFields({ beneficiary: addr.beneficiary, verifier: addr.verifier }))
      .attach("cover", PNG, { filename: "school.png", contentType: "image/png" })
      .expect(201);
    const args = draft.body.contractArgs;
    expect(args.metadataCID).toMatch(/^local:\/\/sha256-[0-9a-f]{64}$/);
    expect(draft.body.metadata.isIpfs).toBe(false);
    expect(args.milestoneAmounts).toEqual([ETH("0.1").toString(), ETH("0.15").toString(), ETH("0.05").toString()]);

    // Draft is not public until it exists on-chain.
    const before = await request(app).get("/api/campaigns").expect(200);
    expect(before.body.campaigns.find((c: { draftId: string }) => c.draftId === draft.body.draftId)).toBeUndefined();

    const tc = contractAs(acc.ngo);
    const synced = await sendAndSync(
      tc.createCampaign(args.title, args.metadataCID, args.beneficiary, args.verifier, args.targetAmount, args.deadline, args.milestoneDescriptions, args.milestoneAmounts),
    );
    const created = synced.events.find((e: { event: string }) => e.event === "CampaignCreated");
    campaignId = created.campaignId;
    expect(synced.events.filter((e: { event: string }) => e.event === "MilestoneCreated")).toHaveLength(3);

    const detail = await request(app).get(`/api/campaigns/${campaignId}`).expect(200);
    const c = detail.body.campaign;
    expect(c).toMatchObject({
      id: campaignId,
      draftId: draft.body.draftId,
      status: "ONCHAIN",
      source: "chain",
      active: true,
      targetWei: ETH("0.3").toString(),
      totalDonatedWei: "0",
      escrowWei: "0",
    });
    expect(c.description).toMatch(/three-classroom/);
    expect(c.ngo).toMatchObject({ address: addr.ngo, name: "Hope Builders Foundation" });
    expect(c.coverImage.isIpfs).toBe(false);
    expect(c.milestones.map((m: { status: string }) => m.status)).toEqual(["PENDING", "PENDING", "PENDING"]);

    const mine = await request(app).get("/api/campaigns/mine").set(auth(tokens.ngo)).expect(200);
    expect(mine.body.campaigns.some((x: { id: number }) => x.id === campaignId)).toBe(true);
  });

  it("returns 404 for campaigns that do not exist on-chain and 400 for invalid ids", async () => {
    await request(app).get("/api/campaigns/9999").expect(404);
    await request(app).get("/api/campaigns/abc").expect(400);
  });
});

describe("transaction verification (/chain/sync-tx)", () => {
  it("rejects malformed and unknown hashes", async () => {
    await request(app).post("/api/chain/sync-tx").send({ txHash: "0x1234" }).expect(400);
    const res = await request(app).post("/api/chain/sync-tx").send({ txHash: `0x${"ab".repeat(32)}` }).expect(404);
    expect(res.body.error.code).toBe("TX_NOT_FOUND");
  });

  it("rejects transactions that were not sent to the TrustChain contract", async () => {
    const tx = await acc.donor.sendTransaction({ to: addr.beneficiary, value: 1n });
    const r = await tx.wait();
    const res = await request(app).post("/api/chain/sync-tx").send({ txHash: r!.hash }).expect(422);
    expect(res.body.error.code).toBe("TX_WRONG_CONTRACT");
  });

  it("rejects reverted transactions", async () => {
    // Hardhat mines the reverted tx but reports the revert as an RPC error carrying the hash.
    const tc = contractAs(acc.donor);
    const err = await tc.donate(424242, { value: 1n, gasLimit: 200_000 }).catch((e) => e);
    const txHash: string = err?.error?.data?.txHash ?? err?.info?.error?.data?.txHash;
    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/);
    const r = await provider.getTransactionReceipt(txHash);
    expect(r?.status).toBe(0);
    const res = await request(app).post("/api/chain/sync-tx").send({ txHash }).expect(422);
    expect(res.body.error.code).toBe("TX_REVERTED");
  });
});

describe("donations", () => {
  it("indexes a verified donation and exposes donor history with live contract totals", async () => {
    const tc = contractAs(acc.donor);
    const synced = await sendAndSync(tc.donate(campaignId, { value: ETH("0.2") }));
    expect(synced.events[0]).toMatchObject({ event: "DonationReceived", campaignId });

    // Syncing the same transaction twice must not duplicate the record.
    await request(app).post("/api/chain/sync-tx").send({ txHash: synced.events[0].txHash }).expect(200);
    expect(await ChainEvent.countDocuments({ txHash: synced.events[0].txHash })).toBe(1);

    const history = await request(app).get(`/api/donations?donor=${addr.donor}`).expect(200);
    expect(history.body.events).toHaveLength(1);
    expect(history.body.totals[0]).toMatchObject({ campaignId, contributedWei: ETH("0.2").toString() });

    const c = (await request(app).get(`/api/campaigns/${campaignId}`).expect(200)).body.campaign;
    expect(c).toMatchObject({ totalDonatedWei: ETH("0.2").toString(), escrowWei: ETH("0.2").toString(), donorCount: 1 });
  });

  it("picks up transactions that were never reported, through the background indexer", async () => {
    const tc = contractAs(acc.donor);
    const tx = await tc.donate(campaignId, { value: ETH("0.01") });
    await tx.wait();
    expect(await ChainEvent.countDocuments({ txHash: tx.hash.toLowerCase() })).toBe(0);
    await syncOnce();
    expect(await ChainEvent.countDocuments({ txHash: tx.hash.toLowerCase(), event: "DonationReceived" })).toBe(1);
  });
});

describe("evidence upload", () => {
  it("blocks donors, unrelated NGOs and non-NGO applicants", async () => {
    const send = (token: string) =>
      request(app)
        .post("/api/evidence")
        .set(auth(token))
        .field({ campaignId: String(campaignId), milestoneId: "0" })
        .attach("files", PNG, { filename: "photo.png", contentType: "image/png" });
    await send(tokens.donor).expect(403);
    await send(tokens.outsider).expect(403);
    const other = await send(tokens.ngo2).expect(403);
    expect(other.body.error.message).toMatch(/campaign's NGO/);
  });

  it("rejects invalid file types, mismatched MIME types, oversize files and empty uploads", async () => {
    const base = () => request(app).post("/api/evidence").set(auth(tokens.ngo)).field({ campaignId: String(campaignId), milestoneId: "0" });
    const exe = await base().attach("files", Buffer.from("MZ..."), { filename: "virus.exe", contentType: "application/octet-stream" }).expect(400);
    expect(exe.body.error.message).toMatch(/not allowed/);
    const mime = await base().attach("files", PNG, { filename: "photo.png", contentType: "image/jpeg" }).expect(400);
    expect(mime.body.error.message).toMatch(/does not match/);
    const disguised = await base().attach("files", PDF, { filename: "receipt.jpg", contentType: "image/jpeg" }).expect(400);
    expect(disguised.body.error.message).toMatch(/not a valid JPG/);
    const big = await base().attach("files", Buffer.concat([PDF, Buffer.alloc(1.2 * 1024 * 1024)]), { filename: "big.pdf", contentType: "application/pdf" }).expect(400);
    expect(big.body.error.code).toBe("LIMIT_FILE_SIZE");
    await base().expect(400);
    await request(app)
      .post("/api/evidence")
      .set(auth(tokens.ngo))
      .field({ campaignId: String(campaignId), milestoneId: "9" })
      .attach("files", PNG, { filename: "p.png", contentType: "image/png" })
      .expect(404);
  });

  it("returns 503 when the configured IPFS provider has no credentials (no silent fallback)", async () => {
    const previous = env.IPFS_PROVIDER;
    env.IPFS_PROVIDER = "pinata";
    try {
      const res = await request(app)
        .post("/api/evidence")
        .set(auth(tokens.ngo))
        .field({ campaignId: String(campaignId), milestoneId: "0" })
        .attach("files", PNG, { filename: "photo.png", contentType: "image/png" })
        .expect(503);
      expect(res.body.error.message).toMatch(/credentials/);
    } finally {
      env.IPFS_PROVIDER = previous;
    }
  });

  let evidenceId: string;
  let manifest: { ref: string; sha256: string };

  it("hashes and stores files, builds a manifest and returns its reference + SHA-256", async () => {
    const res = await request(app)
      .post("/api/evidence")
      .set(auth(tokens.ngo))
      .field({ campaignId: String(campaignId), milestoneId: "0", note: "Foundation poured on 12 Oct" })
      .attach("files", JPG, { filename: "site.jpg", contentType: "image/jpeg" })
      .attach("files", PDF, { filename: "cement-receipt.pdf", contentType: "application/pdf" })
      .expect(201);
    const ev = res.body.evidence;
    evidenceId = ev.id;
    manifest = ev.manifest;
    expect(ev.status).toBe("UPLOADED");
    expect(ev.isIpfs).toBe(false);
    expect(ev.files).toHaveLength(2);
    expect(ev.manifest.sha256).toMatch(/^0x[0-9a-f]{64}$/);

    const file = await request(app).get(new URL(ev.files[1].url).pathname).expect(200);
    expect(file.headers["x-trustchain-storage"]).toMatch(/not IPFS/);
    expect(file.headers["content-type"]).toBe("application/pdf");
  });

  it("marks evidence SUBMITTED only after the NGO's on-chain submitEvidence transaction", async () => {
    const tc = contractAs(acc.ngo);
    await sendAndSync(tc.submitEvidence(campaignId, 0, manifest.ref, manifest.sha256));
    const ev = (await request(app).get(`/api/evidence/${evidenceId}`).expect(200)).body.evidence;
    expect(ev.status).toBe("SUBMITTED");
    expect(ev.submitTxHash).toMatch(/^0x/);

    const c = (await request(app).get(`/api/campaigns/${campaignId}`).expect(200)).body.campaign;
    expect(c.milestones[0]).toMatchObject({ status: "PENDING_VERIFICATION", evidenceCID: manifest.ref, evidenceHash: manifest.sha256 });
    expect(c.milestones[0].evidence[0].id).toBe(evidenceId);
  });

  it("verifies evidence integrity against the hash recorded on-chain", async () => {
    const res = await request(app).get(`/api/evidence/${evidenceId}/integrity`).expect(200);
    expect(res.body).toMatchObject({ allMatch: true, isCurrentOnChainEvidence: true, manifest: { match: true } });
  });

  it("refuses new evidence while the milestone is pending verification", async () => {
    await request(app)
      .post("/api/evidence")
      .set(auth(tokens.ngo))
      .field({ campaignId: String(campaignId), milestoneId: "0" })
      .attach("files", PNG, { filename: "photo.png", contentType: "image/png" })
      .expect(409);
  });

  it("validates CID references", async () => {
    const ok = await request(app).get("/api/evidence/validate-cid/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi").expect(200);
    expect(ok.body).toMatchObject({ valid: true, isIpfs: true });
    const bad = await request(app).get("/api/evidence/validate-cid/not-a-cid").expect(200);
    expect(bad.body.valid).toBe(false);
    const local = await request(app).get(`/api/evidence/validate-cid/${encodeURIComponent(manifest.ref)}`).expect(200);
    expect(local.body).toMatchObject({ valid: true, kind: "local", isIpfs: false });
  });
});

describe("verification and release", () => {
  it("lists pending reviews only for the campaign's assigned verifier", async () => {
    const mine = await request(app).get("/api/verifications/pending").set(auth(tokens.verifier)).expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ campaignId, milestoneId: 0, evidence: { status: "SUBMITTED" } });
    const other = await request(app).get("/api/verifications/pending").set(auth(tokens.verifier2)).expect(200);
    expect(other.body.items).toHaveLength(0);
    await request(app).get("/api/verifications/pending").set(auth(tokens.ngo)).expect(403);
  });

  it("has no API that can approve a milestone — approval exists only as an on-chain transaction", async () => {
    await request(app).post("/api/verifications").set(auth(tokens.verifier)).send({ campaignId, milestoneId: 0 }).expect(404);
    await request(app).post(`/api/campaigns/${campaignId}/milestones/0/approve`).set(auth(tokens.verifier)).expect(404);
    expect(await Verification.countDocuments()).toBe(0);
  });

  it("records an approval from the verifier's transaction, then the release", async () => {
    await sendAndSync(contractAs(acc.verifier).approveMilestone(campaignId, 0));
    const history = await request(app).get(`/api/verifications/history?campaignId=${campaignId}`).expect(200);
    expect(history.body.records[0]).toMatchObject({ decision: "APPROVED", verifier: addr.verifier, milestoneId: 0, campaignTitle: expect.any(String) });
    expect(history.body.records[0].evidenceHash).toBeTruthy();

    const awaiting = await request(app).get("/api/verifications/awaiting-release").set(auth(tokens.verifier)).expect(200);
    expect(awaiting.body.items[0]).toMatchObject({ campaignId, milestoneId: 0 });

    const synced = await sendAndSync(contractAs(acc.verifier).releaseFunds(campaignId, 0));
    expect(synced.events[0]).toMatchObject({ event: "FundsReleased", campaignId, milestoneId: 0 });
    const block = synced.blockNumber as number;
    const delta = (await provider.getBalance(addr.beneficiary, block)) - (await provider.getBalance(addr.beneficiary, block - 1));
    expect(delta).toBe(ETH("0.1"));

    const c = (await request(app).get(`/api/campaigns/${campaignId}`).expect(200)).body.campaign;
    expect(c.totalReleasedWei).toBe(ETH("0.1").toString());
    expect(c.escrowWei).toBe(ETH("0.11").toString());
    expect(c.milestones[0].status).toBe("RELEASED");
    expect(c.milestones[0].evidence[0].status).toBe("RELEASED");
  });

  it("rejects a duplicate release on-chain", async () => {
    await expect(contractAs(acc.verifier).releaseFunds.staticCall(campaignId, 0)).rejects.toThrow();
  });

  it("rejects approval from a verifier not assigned to the campaign (on-chain)", async () => {
    // Prepare milestone 1 evidence.
    const up = await request(app)
      .post("/api/evidence")
      .set(auth(tokens.ngo))
      .field({ campaignId: String(campaignId), milestoneId: "1" })
      .attach("files", PNG, { filename: "walls.png", contentType: "image/png" })
      .expect(201);
    await sendAndSync(contractAs(acc.ngo).submitEvidence(campaignId, 1, up.body.evidence.manifest.ref, up.body.evidence.manifest.sha256));
    await expect(contractAs(acc.verifier2).approveMilestone.staticCall(campaignId, 1)).rejects.toThrow();
    await expect(contractAs(acc.ngo).approveMilestone.staticCall(campaignId, 1)).rejects.toThrow();
  });

  it("records a rejection with its reason and lets the NGO resubmit", async () => {
    await sendAndSync(contractAs(acc.verifier).rejectMilestone(campaignId, 1, "Photo does not show the roof"));
    const history = await request(app).get(`/api/verifications/history?verifier=${addr.verifier}`).expect(200);
    expect(history.body.records[0]).toMatchObject({ decision: "REJECTED", reason: "Photo does not show the roof", milestoneId: 1 });

    const c = (await request(app).get(`/api/campaigns/${campaignId}`).expect(200)).body.campaign;
    expect(c.milestones[1]).toMatchObject({ status: "REJECTED", rejectionReason: "Photo does not show the roof" });
    expect(c.milestones[1].evidence[0].status).toBe("REJECTED");

    // Resubmission is allowed after rejection.
    await request(app)
      .post("/api/evidence")
      .set(auth(tokens.ngo))
      .field({ campaignId: String(campaignId), milestoneId: "1" })
      .attach("files", PNG, { filename: "roof.png", contentType: "image/png" })
      .expect(201);
  });

  it("exposes the full public transaction timeline and transaction details", async () => {
    const events = await request(app).get(`/api/campaigns/${campaignId}/events`).expect(200);
    const names = events.body.events.map((e: { event: string }) => e.event);
    expect(names).toEqual(
      expect.arrayContaining(["CampaignCreated", "MilestoneCreated", "DonationReceived", "EvidenceSubmitted", "MilestoneApproved", "FundsReleased", "MilestoneRejected"]),
    );
    const release = events.body.events.find((e: { event: string }) => e.event === "FundsReleased");
    const tx = await request(app).get(`/api/chain/tx/${release.txHash}`).expect(200);
    expect(tx.body.receipt).toMatchObject({ status: "success", toTrustChain: true });
    expect(tx.body.events[0].event).toBe("FundsReleased");

    const byAddress = await request(app).get(`/api/chain/transactions?address=${addr.donor}`).expect(200);
    expect(byAddress.body.events.every((e: { actor: string }) => e.actor === addr.donor)).toBe(true);
  });

  it("gives the admin an overview whose totals match the contract", async () => {
    const res = await request(app).get("/api/admin/overview").set(auth(tokens.admin)).expect(200);
    const onChain = await contractAs(acc.admin).getCampaign(campaignId);
    expect(BigInt(res.body.totalDonatedWei)).toBeGreaterThanOrEqual(onChain.totalDonated);
    expect(res.body.pendingReviews).toBe(0);
    expect(res.body.recentEvents.length).toBeGreaterThan(0);
  });
});

describe("role revocation", () => {
  it("removes API access as soon as the role is revoked on-chain", async () => {
    await request(app).get("/api/campaigns/mine").set(auth(tokens.ngo2)).expect(200);
    await sendAndSync(contractAs(acc.admin).revokeNGO(addr.ngo2));
    await request(app).get("/api/campaigns/mine").set(auth(tokens.ngo2)).expect(403);
    expect(ZeroHash).toBeTruthy();
  });
});
