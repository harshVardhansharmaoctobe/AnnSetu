import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

const ETH = (v: string) => ethers.parseEther(v);
const HASH = ethers.sha256(ethers.toUtf8Bytes("evidence-manifest"));
const CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

enum Status {
  Pending,
  Submitted,
  Approved,
  Rejected,
  Released,
}

async function deployFixture() {
  const [admin, ngo, verifier, verifier2, donor, donor2, beneficiary, outsider] = await ethers.getSigners();
  const TrustChain = await ethers.getContractFactory("TrustChain");
  const tc = await TrustChain.deploy(admin.address);
  await tc.registerNGO(ngo.address);
  await tc.registerVerifier(verifier.address);
  await tc.registerVerifier(verifier2.address);
  return { tc, admin, ngo, verifier, verifier2, donor, donor2, beneficiary, outsider };
}

async function deadlineIn(days = 30) {
  return BigInt((await time.latest()) + days * 24 * 3600);
}

/** Campaign 1: target 3 ETH, milestones 1 + 1.5 + 0.5 ETH, beneficiary set. */
async function campaignFixture() {
  const ctx = await loadFixture(deployFixture);
  const { tc, ngo, verifier, beneficiary } = ctx;
  await tc
    .connect(ngo)
    .createCampaign(
      "Build a primary school in Kibera",
      "bafkreiexamplemetadatacid",
      beneficiary.address,
      verifier.address,
      ETH("3"),
      await deadlineIn(),
      ["Foundation", "Walls and roof", "Furniture"],
      [ETH("1"), ETH("1.5"), ETH("0.5")],
    );
  return { ...ctx, campaignId: 1n };
}

async function fundedSubmittedFixture() {
  const ctx = await campaignFixture();
  const { tc, ngo, donor, campaignId } = ctx;
  await tc.connect(donor).donate(campaignId, { value: ETH("2") });
  await tc.connect(ngo).submitEvidence(campaignId, 0, CID, HASH);
  return ctx;
}

describe("TrustChain", () => {
  describe("deployment & roles", () => {
    it("grants the admin role to the constructor argument", async () => {
      const { tc, admin, outsider } = await loadFixture(deployFixture);
      expect(await tc.isAdmin(admin.address)).to.equal(true);
      expect(await tc.isAdmin(outsider.address)).to.equal(false);
    });

    it("rejects a zero admin", async () => {
      const F = await ethers.getContractFactory("TrustChain");
      await expect(F.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(F, "ZeroAddress");
    });

    it("lets the admin register NGOs and verifiers and emits events", async () => {
      const { tc, admin, outsider } = await loadFixture(deployFixture);
      await expect(tc.registerNGO(outsider.address))
        .to.emit(tc, "NGORegistered")
        .withArgs(outsider.address, admin.address);
      expect(await tc.isNGO(outsider.address)).to.equal(true);
    });

    it("blocks non-admins from registering roles", async () => {
      const { tc, outsider, ngo } = await loadFixture(deployFixture);
      await expect(tc.connect(ngo).registerNGO(outsider.address)).to.be.revertedWithCustomError(
        tc,
        "AccessControlUnauthorizedAccount",
      );
      await expect(tc.connect(outsider).registerVerifier(outsider.address)).to.be.revertedWithCustomError(
        tc,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("prevents duplicate registration, zero address and NGO/verifier role overlap", async () => {
      const { tc, ngo, verifier } = await loadFixture(deployFixture);
      await expect(tc.registerNGO(ngo.address)).to.be.revertedWithCustomError(tc, "AlreadyRegistered");
      await expect(tc.registerNGO(ethers.ZeroAddress)).to.be.revertedWithCustomError(tc, "ZeroAddress");
      await expect(tc.registerVerifier(ngo.address)).to.be.revertedWithCustomError(tc, "RoleConflict");
      await expect(tc.registerNGO(verifier.address)).to.be.revertedWithCustomError(tc, "RoleConflict");
    });

    it("lets the admin revoke roles", async () => {
      const { tc, ngo, verifier, outsider } = await loadFixture(deployFixture);
      await expect(tc.revokeNGO(ngo.address)).to.emit(tc, "NGORevoked");
      await expect(tc.revokeVerifier(verifier.address)).to.emit(tc, "VerifierRevoked");
      expect(await tc.isNGO(ngo.address)).to.equal(false);
      await expect(tc.revokeNGO(outsider.address)).to.be.revertedWithCustomError(tc, "NotRegistered");
    });
  });

  describe("campaign creation", () => {
    it("creates a campaign with milestones and activates it when fully allocated", async () => {
      const { tc, ngo, verifier, beneficiary } = await loadFixture(deployFixture);
      const deadline = await deadlineIn();
      await expect(
        tc
          .connect(ngo)
          .createCampaign("School", "bafkreimeta", beneficiary.address, verifier.address, ETH("2"), deadline, ["A", "B"], [ETH("1"), ETH("1")]),
      )
        .to.emit(tc, "CampaignCreated")
        .withArgs(1n, ngo.address, verifier.address, beneficiary.address, ETH("2"), deadline, "School", "bafkreimeta")
        .and.to.emit(tc, "MilestoneCreated")
        .withArgs(1n, 0n, ETH("1"), "A")
        .and.to.emit(tc, "CampaignStatusChanged")
        .withArgs(1n, true, false);

      const c = await tc.getCampaign(1);
      expect(c.ngo).to.equal(ngo.address);
      expect(c.beneficiary).to.equal(beneficiary.address);
      expect(c.targetAmount).to.equal(ETH("2"));
      expect(c.totalAllocated).to.equal(ETH("2"));
      expect(c.milestoneCount).to.equal(2n);
      expect(c.active).to.equal(true);
      expect(await tc.campaignCount()).to.equal(1n);
      const ms = await tc.getMilestones(1);
      expect(ms.length).to.equal(2);
      expect(ms[1].description).to.equal("B");
      expect(ms[1].status).to.equal(Status.Pending);
    });

    it("keeps a partially allocated campaign inactive until createMilestone completes it", async () => {
      const { tc, ngo, verifier, beneficiary, donor } = await loadFixture(deployFixture);
      await tc
        .connect(ngo)
        .createCampaign("School", "bafkreimeta", beneficiary.address, verifier.address, ETH("2"), await deadlineIn(), ["A"], [ETH("1")]);
      expect((await tc.getCampaign(1)).active).to.equal(false);
      await expect(tc.connect(donor).donate(1, { value: ETH("0.1") })).to.be.revertedWithCustomError(
        tc,
        "CampaignNotActive",
      );
      await expect(tc.connect(ngo).createMilestone(1, "B", ETH("1")))
        .to.emit(tc, "MilestoneCreated")
        .withArgs(1n, 1n, ETH("1"), "B")
        .and.to.emit(tc, "CampaignStatusChanged")
        .withArgs(1n, true, false);
      expect((await tc.getCampaign(1)).active).to.equal(true);
    });

    it("rejects campaign creation by non-NGOs", async () => {
      const { tc, outsider, verifier, beneficiary } = await loadFixture(deployFixture);
      await expect(
        tc
          .connect(outsider)
          .createCampaign("X", "cid", beneficiary.address, verifier.address, ETH("1"), await deadlineIn(), ["A"], [ETH("1")]),
      ).to.be.revertedWithCustomError(tc, "AccessControlUnauthorizedAccount");
    });

    it("rejects invalid campaign parameters", async () => {
      const { tc, ngo, verifier, beneficiary, outsider } = await loadFixture(deployFixture);
      const d = await deadlineIn();
      const create = (o: Partial<{ title: string; cid: string; ben: string; ver: string; target: bigint; deadline: bigint; descs: string[]; amts: bigint[] }>) =>
        tc
          .connect(ngo)
          .createCampaign(
            o.title ?? "T",
            o.cid ?? "cid",
            o.ben ?? beneficiary.address,
            o.ver ?? verifier.address,
            o.target ?? ETH("1"),
            o.deadline ?? d,
            o.descs ?? ["A"],
            o.amts ?? [ETH("1")],
          );

      await expect(create({ title: "" })).to.be.revertedWithCustomError(tc, "EmptyText");
      await expect(create({ title: "x".repeat(121) })).to.be.revertedWithCustomError(tc, "TextTooLong");
      await expect(create({ cid: "" })).to.be.revertedWithCustomError(tc, "EmptyText");
      await expect(create({ ben: ethers.ZeroAddress })).to.be.revertedWithCustomError(tc, "ZeroAddress");
      await expect(create({ ver: outsider.address })).to.be.revertedWithCustomError(tc, "NotAVerifier");
      await expect(create({ ben: verifier.address })).to.be.revertedWithCustomError(tc, "ConflictOfInterest");
      await expect(create({ target: 0n })).to.be.revertedWithCustomError(tc, "InvalidAmount");
      await expect(create({ deadline: BigInt(await time.latest()) })).to.be.revertedWithCustomError(tc, "InvalidDeadline");
      await expect(create({ descs: ["A", "B"] })).to.be.revertedWithCustomError(tc, "LengthMismatch");
      await expect(create({ descs: [""] })).to.be.revertedWithCustomError(tc, "EmptyText");
      await expect(create({ amts: [0n] })).to.be.revertedWithCustomError(tc, "InvalidAmount");
      await expect(
        create({ descs: Array(21).fill("m"), amts: Array(21).fill(1n), target: 21n }),
      ).to.be.revertedWithCustomError(tc, "TooManyMilestones");
    });

    it("prevents an NGO from assigning itself as verifier", async () => {
      const { tc, admin, ngo, beneficiary } = await loadFixture(deployFixture);
      // An address cannot hold both roles, so the NGO is never a valid verifier.
      await expect(
        tc
          .connect(ngo)
          .createCampaign("T", "cid", beneficiary.address, ngo.address, ETH("1"), await deadlineIn(), ["A"], [ETH("1")]),
      ).to.be.revertedWithCustomError(tc, "NotAVerifier");
      // Admin cannot grant VERIFIER_ROLE to the NGO through the TrustChain API either.
      await expect(tc.connect(admin).registerVerifier(ngo.address)).to.be.revertedWithCustomError(tc, "RoleConflict");
      await expect(tc.connect(admin).grantRole(await tc.VERIFIER_ROLE(), ngo.address)).to.be.revertedWithCustomError(
        tc,
        "RoleConflict",
      );
    });

    it("rejects milestone allocations that exceed the target", async () => {
      const { tc, ngo, verifier, beneficiary } = await loadFixture(deployFixture);
      await expect(
        tc
          .connect(ngo)
          .createCampaign("T", "cid", beneficiary.address, verifier.address, ETH("2"), await deadlineIn(), ["A", "B"], [ETH("1"), ETH("1.5")]),
      )
        .to.be.revertedWithCustomError(tc, "AllocationExceedsTarget")
        .withArgs(ETH("2.5"), ETH("2"));

      await tc
        .connect(ngo)
        .createCampaign("T", "cid", beneficiary.address, verifier.address, ETH("2"), await deadlineIn(), ["A"], [ETH("1.5")]);
      await expect(tc.connect(ngo).createMilestone(1, "B", ETH("0.6"))).to.be.revertedWithCustomError(
        tc,
        "AllocationExceedsTarget",
      );
    });

    it("only lets the campaign's own NGO add milestones", async () => {
      const { tc, ngo, verifier, beneficiary, outsider, admin } = await loadFixture(deployFixture);
      await tc
        .connect(ngo)
        .createCampaign("T", "cid", beneficiary.address, verifier.address, ETH("2"), await deadlineIn(), ["A"], [ETH("1")]);
      await tc.connect(admin).registerNGO(outsider.address);
      await expect(tc.connect(outsider).createMilestone(1, "B", ETH("1"))).to.be.revertedWithCustomError(
        tc,
        "NotCampaignNGO",
      );
    });

    it("reverts on unknown campaign and milestone ids", async () => {
      const { tc } = await loadFixture(campaignFixture);
      await expect(tc.getCampaign(99)).to.be.revertedWithCustomError(tc, "CampaignNotFound");
      await expect(tc.getCampaign(0)).to.be.revertedWithCustomError(tc, "CampaignNotFound");
      await expect(tc.getMilestone(1, 3)).to.be.revertedWithCustomError(tc, "MilestoneNotFound");
      await expect(tc.getMilestone(99, 0)).to.be.revertedWithCustomError(tc, "CampaignNotFound");
    });
  });

  describe("donations", () => {
    it("accepts a donation, holds it in escrow and records the contribution", async () => {
      const { tc, donor, campaignId } = await loadFixture(campaignFixture);
      const tx = tc.connect(donor).donate(campaignId, { value: ETH("1.25") });
      await expect(tx).to.emit(tc, "DonationReceived").withArgs(campaignId, donor.address, ETH("1.25"), ETH("1.25"));
      await expect(tx).to.changeEtherBalances([donor, tc], [-ETH("1.25"), ETH("1.25")]);

      expect(await tc.getDonation(campaignId, donor.address)).to.equal(ETH("1.25"));
      expect(await tc.escrowBalance(campaignId)).to.equal(ETH("1.25"));
      expect((await tc.getCampaign(campaignId)).totalDonated).to.equal(ETH("1.25"));
    });

    it("accumulates multiple donations per donor and across donors", async () => {
      const { tc, donor, donor2, campaignId } = await loadFixture(campaignFixture);
      await tc.connect(donor).donate(campaignId, { value: ETH("0.5") });
      await tc.connect(donor).donate(campaignId, { value: ETH("0.25") });
      await tc.connect(donor2).donate(campaignId, { value: ETH("1") });
      expect(await tc.getDonation(campaignId, donor.address)).to.equal(ETH("0.75"));
      expect(await tc.getDonation(campaignId, donor2.address)).to.equal(ETH("1"));
      expect((await tc.getCampaign(campaignId)).totalDonated).to.equal(ETH("1.75"));
    });

    it("rejects zero donations, unknown campaigns and donations above the remaining target", async () => {
      const { tc, donor, campaignId } = await loadFixture(campaignFixture);
      await expect(tc.connect(donor).donate(campaignId, { value: 0 })).to.be.revertedWithCustomError(tc, "InvalidAmount");
      await expect(tc.connect(donor).donate(42, { value: ETH("1") })).to.be.revertedWithCustomError(tc, "CampaignNotFound");
      await tc.connect(donor).donate(campaignId, { value: ETH("2.5") });
      await expect(tc.connect(donor).donate(campaignId, { value: ETH("0.6") }))
        .to.be.revertedWithCustomError(tc, "DonationExceedsTarget")
        .withArgs(ETH("0.5"));
    });

    it("rejects donations after the deadline", async () => {
      const { tc, donor, campaignId } = await loadFixture(campaignFixture);
      await time.increase(31 * 24 * 3600);
      await expect(tc.connect(donor).donate(campaignId, { value: ETH("1") })).to.be.revertedWithCustomError(
        tc,
        "CampaignEnded",
      );
    });

    it("rejects donations to a suspended campaign and only the admin can suspend", async () => {
      const { tc, donor, ngo, campaignId } = await loadFixture(campaignFixture);
      await expect(tc.connect(ngo).setCampaignSuspended(campaignId, true)).to.be.revertedWithCustomError(
        tc,
        "AccessControlUnauthorizedAccount",
      );
      await expect(tc.setCampaignSuspended(campaignId, true))
        .to.emit(tc, "CampaignStatusChanged")
        .withArgs(campaignId, false, true);
      await expect(tc.connect(donor).donate(campaignId, { value: ETH("1") })).to.be.revertedWithCustomError(
        tc,
        "CampaignNotActive",
      );
      await tc.setCampaignSuspended(campaignId, false);
      await expect(tc.connect(donor).donate(campaignId, { value: ETH("1") })).to.emit(tc, "DonationReceived");
    });

    it("rejects plain ETH transfers to the contract", async () => {
      const { tc, donor } = await loadFixture(campaignFixture);
      await expect(donor.sendTransaction({ to: await tc.getAddress(), value: ETH("1") })).to.be.reverted;
    });
  });

  describe("evidence submission", () => {
    it("lets the campaign NGO submit evidence, moving the milestone to Submitted", async () => {
      const { tc, ngo, campaignId } = await loadFixture(campaignFixture);
      await expect(tc.connect(ngo).submitEvidence(campaignId, 0, CID, HASH))
        .to.emit(tc, "EvidenceSubmitted")
        .withArgs(campaignId, 0n, ngo.address, CID, HASH);
      const m = await tc.getMilestone(campaignId, 0);
      expect(m.status).to.equal(Status.Submitted);
      expect(m.evidenceCID).to.equal(CID);
      expect(m.evidenceHash).to.equal(HASH);
      expect(m.submittedAt).to.be.greaterThan(0n);
    });

    it("blocks evidence from anyone but the campaign's NGO", async () => {
      const { tc, admin, outsider, verifier, donor, campaignId } = await loadFixture(campaignFixture);
      for (const signer of [outsider, verifier, donor, admin]) {
        await expect(tc.connect(signer).submitEvidence(campaignId, 0, CID, HASH)).to.be.revertedWithCustomError(
          tc,
          "NotCampaignNGO",
        );
      }
      // A different registered NGO cannot submit for this campaign either.
      await tc.registerNGO(outsider.address);
      await expect(tc.connect(outsider).submitEvidence(campaignId, 0, CID, HASH)).to.be.revertedWithCustomError(
        tc,
        "NotCampaignNGO",
      );
    });

    it("blocks evidence from an NGO whose role was revoked", async () => {
      const { tc, ngo, campaignId } = await loadFixture(campaignFixture);
      await tc.revokeNGO(ngo.address);
      await expect(tc.connect(ngo).submitEvidence(campaignId, 0, CID, HASH)).to.be.revertedWithCustomError(
        tc,
        "NotCampaignNGO",
      );
    });

    it("validates evidence references and milestone ids", async () => {
      const { tc, ngo, campaignId } = await loadFixture(campaignFixture);
      await expect(tc.connect(ngo).submitEvidence(campaignId, 0, "", HASH)).to.be.revertedWithCustomError(tc, "InvalidEvidence");
      await expect(tc.connect(ngo).submitEvidence(campaignId, 0, CID, ethers.ZeroHash)).to.be.revertedWithCustomError(
        tc,
        "InvalidEvidence",
      );
      await expect(tc.connect(ngo).submitEvidence(campaignId, 0, "x".repeat(129), HASH)).to.be.revertedWithCustomError(
        tc,
        "InvalidEvidence",
      );
      await expect(tc.connect(ngo).submitEvidence(campaignId, 7, CID, HASH)).to.be.revertedWithCustomError(
        tc,
        "MilestoneNotFound",
      );
    });

    it("prevents re-submission while pending verification", async () => {
      const { tc, ngo, campaignId } = await loadFixture(fundedSubmittedFixture);
      await expect(tc.connect(ngo).submitEvidence(campaignId, 0, CID, HASH))
        .to.be.revertedWithCustomError(tc, "InvalidMilestoneStatus")
        .withArgs(Status.Submitted);
    });
  });

  describe("verification", () => {
    it("lets the assigned verifier approve", async () => {
      const { tc, verifier, campaignId } = await loadFixture(fundedSubmittedFixture);
      await expect(tc.connect(verifier).approveMilestone(campaignId, 0))
        .to.emit(tc, "MilestoneApproved")
        .withArgs(campaignId, 0n, verifier.address);
      const m = await tc.getMilestone(campaignId, 0);
      expect(m.status).to.equal(Status.Approved);
      expect(m.reviewedAt).to.be.greaterThan(0n);
    });

    it("lets the assigned verifier reject with a reason, and the NGO resubmit", async () => {
      const { tc, verifier, ngo, campaignId } = await loadFixture(fundedSubmittedFixture);
      await expect(tc.connect(verifier).rejectMilestone(campaignId, 0, "Receipt is illegible"))
        .to.emit(tc, "MilestoneRejected")
        .withArgs(campaignId, 0n, verifier.address, "Receipt is illegible");
      let m = await tc.getMilestone(campaignId, 0);
      expect(m.status).to.equal(Status.Rejected);
      expect(m.rejectionReason).to.equal("Receipt is illegible");

      const newHash = ethers.sha256(ethers.toUtf8Bytes("v2"));
      await tc.connect(ngo).submitEvidence(campaignId, 0, CID, newHash);
      m = await tc.getMilestone(campaignId, 0);
      expect(m.status).to.equal(Status.Submitted);
      expect(m.rejectionReason).to.equal("");
      expect(m.evidenceHash).to.equal(newHash);
    });

    it("requires a non-empty rejection reason", async () => {
      const { tc, verifier, campaignId } = await loadFixture(fundedSubmittedFixture);
      await expect(tc.connect(verifier).rejectMilestone(campaignId, 0, "")).to.be.revertedWithCustomError(tc, "EmptyText");
      await expect(tc.connect(verifier).rejectMilestone(campaignId, 0, "x".repeat(501))).to.be.revertedWithCustomError(
        tc,
        "TextTooLong",
      );
    });

    it("blocks approval/rejection by the NGO, outsiders, admin and other verifiers", async () => {
      const { tc, ngo, outsider, admin, verifier2, campaignId } = await loadFixture(fundedSubmittedFixture);
      for (const signer of [ngo, outsider, admin, verifier2]) {
        await expect(tc.connect(signer).approveMilestone(campaignId, 0)).to.be.revertedWithCustomError(
          tc,
          "NotCampaignVerifier",
        );
        await expect(tc.connect(signer).rejectMilestone(campaignId, 0, "no")).to.be.revertedWithCustomError(
          tc,
          "NotCampaignVerifier",
        );
      }
    });

    it("blocks approval by a verifier whose role was revoked", async () => {
      const { tc, verifier, campaignId } = await loadFixture(fundedSubmittedFixture);
      await tc.revokeVerifier(verifier.address);
      await expect(tc.connect(verifier).approveMilestone(campaignId, 0)).to.be.revertedWithCustomError(
        tc,
        "NotCampaignVerifier",
      );
    });

    it("cannot approve a milestone without submitted evidence", async () => {
      const { tc, verifier, campaignId } = await loadFixture(fundedSubmittedFixture);
      await expect(tc.connect(verifier).approveMilestone(campaignId, 1))
        .to.be.revertedWithCustomError(tc, "InvalidMilestoneStatus")
        .withArgs(Status.Pending);
    });

    it("lets the admin reassign the verifier, with eligibility checks", async () => {
      const { tc, verifier, verifier2, ngo, outsider, campaignId } = await loadFixture(fundedSubmittedFixture);
      await expect(tc.connect(ngo).setCampaignVerifier(campaignId, verifier2.address)).to.be.revertedWithCustomError(
        tc,
        "AccessControlUnauthorizedAccount",
      );
      await expect(tc.setCampaignVerifier(campaignId, outsider.address)).to.be.revertedWithCustomError(tc, "NotAVerifier");
      await expect(tc.setCampaignVerifier(campaignId, verifier2.address))
        .to.emit(tc, "CampaignVerifierChanged")
        .withArgs(campaignId, verifier.address, verifier2.address);
      await expect(tc.connect(verifier).approveMilestone(campaignId, 0)).to.be.revertedWithCustomError(
        tc,
        "NotCampaignVerifier",
      );
      await expect(tc.connect(verifier2).approveMilestone(campaignId, 0)).to.emit(tc, "MilestoneApproved");
    });
  });

  describe("fund release", () => {
    async function approvedFixture() {
      const ctx = await fundedSubmittedFixture();
      await ctx.tc.connect(ctx.verifier).approveMilestone(ctx.campaignId, 0);
      return ctx;
    }

    it("releases the allocation to the beneficiary after approval", async () => {
      const { tc, verifier, beneficiary, campaignId } = await loadFixture(approvedFixture);
      const tx = tc.connect(verifier).releaseFunds(campaignId, 0);
      await expect(tx)
        .to.emit(tc, "FundsReleased")
        .withArgs(campaignId, 0n, beneficiary.address, ETH("1"), verifier.address);
      await expect(tx).to.changeEtherBalances([tc, beneficiary], [-ETH("1"), ETH("1")]);

      const c = await tc.getCampaign(campaignId);
      expect(c.totalReleased).to.equal(ETH("1"));
      expect(await tc.escrowBalance(campaignId)).to.equal(ETH("1"));
      const m = await tc.getMilestone(campaignId, 0);
      expect(m.status).to.equal(Status.Released);
      expect(m.releasedAt).to.be.greaterThan(0n);
    });

    it("lets the admin trigger release of an approved milestone", async () => {
      const { tc, admin, campaignId } = await loadFixture(approvedFixture);
      await expect(tc.connect(admin).releaseFunds(campaignId, 0))
        .to.emit(tc, "FundsReleased")
        .withArgs(campaignId, 0n, anyValue, ETH("1"), admin.address);
    });

    it("prevents double release", async () => {
      const { tc, verifier, admin, campaignId } = await loadFixture(approvedFixture);
      await tc.connect(verifier).releaseFunds(campaignId, 0);
      await expect(tc.connect(verifier).releaseFunds(campaignId, 0))
        .to.be.revertedWithCustomError(tc, "AlreadyReleased")
        .withArgs(campaignId, 0n);
      await expect(tc.connect(admin).releaseFunds(campaignId, 0)).to.be.revertedWithCustomError(tc, "AlreadyReleased");
      expect((await tc.getCampaign(campaignId)).totalReleased).to.equal(ETH("1"));
    });

    it("blocks release by the NGO, beneficiary, donors and other verifiers", async () => {
      const { tc, ngo, beneficiary, donor, verifier2, campaignId } = await loadFixture(approvedFixture);
      for (const signer of [ngo, beneficiary, donor, verifier2]) {
        await expect(tc.connect(signer).releaseFunds(campaignId, 0)).to.be.revertedWithCustomError(
          tc,
          "NotAuthorizedToRelease",
        );
      }
    });

    it("blocks release before approval and after rejection", async () => {
      const { tc, verifier, campaignId } = await loadFixture(fundedSubmittedFixture);
      await expect(tc.connect(verifier).releaseFunds(campaignId, 0))
        .to.be.revertedWithCustomError(tc, "InvalidMilestoneStatus")
        .withArgs(Status.Submitted);
      await tc.connect(verifier).rejectMilestone(campaignId, 0, "Missing invoice");
      await expect(tc.connect(verifier).releaseFunds(campaignId, 0))
        .to.be.revertedWithCustomError(tc, "InvalidMilestoneStatus")
        .withArgs(Status.Rejected);
      await expect(tc.connect(verifier).releaseFunds(campaignId, 1))
        .to.be.revertedWithCustomError(tc, "InvalidMilestoneStatus")
        .withArgs(Status.Pending);
    });

    it("blocks release when escrow is insufficient, then allows it after more donations", async () => {
      const { tc, ngo, verifier, donor2, campaignId } = await loadFixture(approvedFixture);
      // Escrow = 2 ETH. Release milestone 0 (1 ETH) -> 1 ETH left; milestone 1 needs 1.5 ETH.
      await tc.connect(verifier).releaseFunds(campaignId, 0);
      await tc.connect(ngo).submitEvidence(campaignId, 1, CID, HASH);
      await tc.connect(verifier).approveMilestone(campaignId, 1);
      await expect(tc.connect(verifier).releaseFunds(campaignId, 1))
        .to.be.revertedWithCustomError(tc, "InsufficientEscrow")
        .withArgs(ETH("1"), ETH("1.5"));

      await tc.connect(donor2).donate(campaignId, { value: ETH("0.5") });
      await expect(tc.connect(verifier).releaseFunds(campaignId, 1)).to.emit(tc, "FundsReleased");
      expect(await tc.escrowBalance(campaignId)).to.equal(0n);
    });

    it("never releases more than was donated across a full campaign", async () => {
      const { tc, ngo, verifier, donor, campaignId } = await loadFixture(campaignFixture);
      await tc.connect(donor).donate(campaignId, { value: ETH("3") });
      for (const id of [0, 1, 2]) {
        await tc.connect(ngo).submitEvidence(campaignId, id, CID, HASH);
        await tc.connect(verifier).approveMilestone(campaignId, id);
        await tc.connect(verifier).releaseFunds(campaignId, id);
      }
      const c = await tc.getCampaign(campaignId);
      expect(c.totalReleased).to.equal(c.totalDonated);
      expect(await ethers.provider.getBalance(await tc.getAddress())).to.equal(0n);
    });

    it("reverts and keeps state when the beneficiary rejects the transfer", async () => {
      const { tc, ngo, verifier, donor } = await loadFixture(deployFixture);
      const rejecting = await (await ethers.getContractFactory("RejectingReceiver")).deploy();
      await tc
        .connect(ngo)
        .createCampaign("T", "cid", await rejecting.getAddress(), verifier.address, ETH("1"), await deadlineIn(), ["A"], [ETH("1")]);
      await tc.connect(donor).donate(1, { value: ETH("1") });
      await tc.connect(ngo).submitEvidence(1, 0, CID, HASH);
      await tc.connect(verifier).approveMilestone(1, 0);

      await expect(tc.connect(verifier).releaseFunds(1, 0)).to.be.revertedWithCustomError(tc, "TransferFailed");
      expect((await tc.getMilestone(1, 0)).status).to.equal(Status.Approved);
      expect((await tc.getCampaign(1)).totalReleased).to.equal(0n);
      expect(await tc.escrowBalance(1)).to.equal(ETH("1"));
    });

    it("blocks re-entrant release attempts from the beneficiary", async () => {
      const { tc, admin, ngo, verifier, donor } = await loadFixture(deployFixture);
      const attacker = await (await ethers.getContractFactory("ReentrantReceiver")).deploy(await tc.getAddress());
      const attackerAddr = await attacker.getAddress();
      // Worst case: the beneficiary is even authorised to call releaseFunds (holds the admin role).
      await tc.connect(admin).grantRole(await tc.DEFAULT_ADMIN_ROLE(), attackerAddr);
      await tc
        .connect(ngo)
        .createCampaign("T", "cid", attackerAddr, verifier.address, ETH("2"), await deadlineIn(), ["A", "B"], [ETH("1"), ETH("1")]);
      await tc.connect(donor).donate(1, { value: ETH("2") });
      for (const id of [0, 1]) {
        await tc.connect(ngo).submitEvidence(1, id, CID, HASH);
        await tc.connect(verifier).approveMilestone(1, id);
      }
      await attacker.setTarget(1, 1);

      await attacker.release(1, 0);
      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentryBlocked()).to.equal(true);
      expect((await tc.getMilestone(1, 0)).status).to.equal(Status.Released);
      expect((await tc.getMilestone(1, 1)).status).to.equal(Status.Approved);
      expect((await tc.getCampaign(1)).totalReleased).to.equal(ETH("1"));
    });
  });

  describe("end-to-end scenario", () => {
    it("admin setup → campaign → donation → evidence → approval → release", async () => {
      const [admin, ngo, verifier, donor, beneficiary] = await ethers.getSigners();
      const tc = await (await ethers.getContractFactory("TrustChain")).deploy(admin.address);
      await tc.registerNGO(ngo.address);
      await tc.registerVerifier(verifier.address);

      await tc
        .connect(ngo)
        .createCampaign(
          "School construction",
          "bafkreimeta",
          beneficiary.address,
          verifier.address,
          ETH("0.3"),
          await deadlineIn(),
          ["Foundation", "Classrooms", "Furniture"],
          [ETH("0.1"), ETH("0.15"), ETH("0.05")],
        );
      await tc.connect(donor).donate(1, { value: ETH("0.2") });
      await tc.connect(ngo).submitEvidence(1, 0, CID, HASH);
      await tc.connect(verifier).approveMilestone(1, 0);
      await expect(tc.connect(verifier).releaseFunds(1, 0)).to.changeEtherBalance(beneficiary, ETH("0.1"));

      const c = await tc.getCampaign(1);
      expect(c.totalDonated).to.equal(ETH("0.2"));
      expect(c.totalReleased).to.equal(ETH("0.1"));
      expect(await tc.escrowBalance(1)).to.equal(ETH("0.1"));
      expect(await tc.getDonation(1, donor.address)).to.equal(ETH("0.2"));
    });
  });
});
