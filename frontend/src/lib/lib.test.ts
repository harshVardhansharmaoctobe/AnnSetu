import { Interface, parseEther } from "ethers";
import { describe, expect, it } from "vitest";
import { formatEth, percent, shortAddress } from "./format";
import { describeTxError } from "./txErrors";
import { parseEthInput, sumMilestones, validateCampaignForm, validateEvidenceFiles, type CampaignFormValues } from "./validation";

const VERIFIER = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";
const NGO = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const BEN = "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65";

const valid = (): CampaignFormValues => ({
  title: "Build a school",
  description: "A three-classroom school building for 240 pupils.",
  beneficiary: BEN,
  verifier: VERIFIER,
  target: "0.3",
  endDate: "2099-01-01",
  milestones: [
    { description: "Foundation", amount: "0.1" },
    { description: "Walls and roof", amount: "0.2" },
  ],
});

describe("formatEth", () => {
  it("formats wei with trimmed decimals", () => {
    expect(formatEth("120000000000000000")).toBe("0.12 ETH");
    expect(formatEth(parseEther("1234.5"))).toBe("1,234.5 ETH");
    expect(formatEth("0")).toBe("0 ETH");
    expect(formatEth("1")).toBe("<0.0001 ETH");
    expect(formatEth(null)).toBe("—");
  });
  it("computes clamped percentages and short addresses", () => {
    expect(percent("50", "200")).toBe(25);
    expect(percent("300", "200")).toBe(100);
    expect(percent("1", "0")).toBe(0);
    expect(shortAddress(VERIFIER)).toBe("0x3c44…93bc");
  });
});

describe("parseEthInput", () => {
  it("accepts valid amounts and rejects bad input", () => {
    expect(parseEthInput("0.05").wei).toBe(parseEther("0.05"));
    expect(parseEthInput("").error).toMatch(/required/);
    expect(parseEthInput("abc").error).toMatch(/number/);
    expect(parseEthInput("-1").error).toMatch(/number/);
    expect(parseEthInput("0").error).toMatch(/greater than zero/);
    expect(parseEthInput("1.0000000000000000001").error).toMatch(/18 decimals/);
    expect(parseEthInput("2", { max: parseEther("1") }).error).toMatch(/maximum/);
  });
});

describe("validateCampaignForm", () => {
  const now = new Date("2026-10-30T00:00:00Z");
  it("passes a valid form", () => {
    expect(validateCampaignForm(valid(), NGO, now)).toEqual({});
  });
  it("requires allocations to equal the target exactly", () => {
    const v = valid();
    v.milestones[1].amount = "0.25";
    expect(validateCampaignForm(v, NGO, now).milestones).toMatch(/add up exactly/);
    expect(sumMilestones(v.milestones)).toBe(parseEther("0.35"));
  });
  it("rejects conflicts of interest, bad addresses, past dates and bad rows", () => {
    expect(validateCampaignForm({ ...valid(), verifier: NGO }, NGO, now).verifier).toMatch(/your own/);
    expect(validateCampaignForm({ ...valid(), beneficiary: VERIFIER }, NGO, now).verifier).toMatch(/beneficiary/);
    expect(validateCampaignForm({ ...valid(), beneficiary: "0x123" }, NGO, now).beneficiary).toBeTruthy();
    expect(validateCampaignForm({ ...valid(), endDate: "2020-01-01" }, NGO, now).endDate).toMatch(/future/);
    expect(validateCampaignForm({ ...valid(), title: "abc" }, NGO, now).title).toBeTruthy();
    const rows = validateCampaignForm({ ...valid(), milestones: [{ description: "x", amount: "0" }] }, NGO, now).milestoneRows;
    expect(rows?.[0]).toMatchObject({ description: expect.any(String), amount: expect.any(String) });
    expect(validateCampaignForm({ ...valid(), milestones: [] }, NGO, now).milestones).toMatch(/at least one/);
  });
});

describe("validateEvidenceFiles", () => {
  const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });
  it("accepts images and PDFs and rejects other types, mismatches, oversize and empty", () => {
    expect(validateEvidenceFiles([file("a.jpg", "image/jpeg"), file("r.pdf", "application/pdf")])).toBeNull();
    expect(validateEvidenceFiles([])).toMatch(/at least one/);
    expect(validateEvidenceFiles([file("a.exe", "application/x-msdownload")])).toMatch(/not an allowed type/);
    expect(validateEvidenceFiles([file("a.png", "image/jpeg")])).toMatch(/not an allowed type/);
    expect(validateEvidenceFiles([file("a.png", "image/png", 11)], 10)).toMatch(/larger/);
    expect(validateEvidenceFiles([file("a.png", "image/png", 0)])).toMatch(/empty/);
    expect(validateEvidenceFiles(Array.from({ length: 7 }, (_, i) => file(`${i}.png`, "image/png")))).toMatch(/At most 6/);
  });
});

describe("describeTxError", () => {
  const iface = new Interface(["error InsufficientEscrow(uint256 available, uint256 required)"]);
  it("explains wallet rejections, contract reverts and missing funds", () => {
    expect(describeTxError({ code: "ACTION_REJECTED" })).toMatch(/rejected/);
    expect(describeTxError({ info: { error: { code: 4001 } } })).toMatch(/rejected/);
    const err = iface.getError("InsufficientEscrow")!;
    expect(describeTxError({ code: "CALL_EXCEPTION", revert: { name: err.name, args: [parseEther("0.1"), parseEther("0.15")] } })).toMatch(
      /0.1 ETH available, 0.15 ETH required/,
    );
    expect(describeTxError({ code: "CALL_EXCEPTION", revert: { name: "AlreadyReleased", args: [1n, 0n] } })).toMatch(/already been released/);
    expect(describeTxError({ code: "CALL_EXCEPTION", revert: { name: "NotCampaignVerifier", args: [] } })).toMatch(/assigned to this campaign/);
    expect(describeTxError({ code: "INSUFFICIENT_FUNDS" })).toMatch(/enough ETH/);
    expect(describeTxError(new Error("boom"))).toBe("boom");
  });
});
