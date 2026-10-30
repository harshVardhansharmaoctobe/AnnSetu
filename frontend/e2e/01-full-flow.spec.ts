/**
 * The PROJECT DEFINITION-OF-DONE scenario, driven through the real UI:
 * admin registers NGO + verifier → NGO creates a school-construction campaign with 3 milestones →
 * donor donates → funds locked in escrow → NGO uploads evidence and submits it on-chain →
 * verifier inspects and approves → contract releases the milestone → donor and public see it.
 */
import { expect, test, type Page } from "@playwright/test";
import { JPG, PDF, PNG, hardhatAccount, rpc, walletContext } from "./wallet";
import { apiGet, ensureAccount, expectTxConfirmed } from "./helpers";

test.describe.configure({ mode: "serial" });

const title = `School construction E2E ${Date.now()}`;
let campaignId: number;
let addr: { admin: string; ngo: string; verifier: string; donor: string; beneficiary: string };
const pages: Record<string, Page> = {};

/** Several wallets are open at once; headless Edge throttles background windows, so focus the active one. */
async function as(role: "admin" | "ngo" | "verifier" | "donor") {
  await pages[role].bringToFront();
  return pages[role];
}

test.beforeAll(async ({ browser }) => {
  addr = {
    admin: await hardhatAccount(0),
    ngo: await hardhatAccount(10),
    verifier: await hardhatAccount(11),
    donor: await hardhatAccount(12),
    beneficiary: await hardhatAccount(13),
  };
  for (const [role, address] of Object.entries(addr)) {
    if (role === "beneficiary") continue;
    pages[role] = await (await walletContext(browser, address)).newPage();
  }
});

test("1. NGO and verifier apply; admin authorises both on-chain", async () => {
  await ensureAccount(pages.ngo, "E2E Hope Builders", "NGO", "Hope Builders E2E");
  await ensureAccount(pages.verifier, "E2E Auditor", "Verifier", "Audit Partners E2E");
  await ensureAccount(pages.admin, "Platform Admin", "Donor");

  const admin = await as("admin");
  for (const [path, name, label] of [
    ["/admin/ngos", "E2E Hope Builders", "Authorise NGO"],
    ["/admin/verifiers", "E2E Auditor", "Authorise verifier"],
  ] as const) {
    await admin.goto(path);
    await expect(admin.getByRole("heading", { name: /^Authorised / })).toBeVisible(); // data loaded
    const row = admin.getByRole("row", { name: new RegExp(name) }).filter({ has: admin.getByRole("button", { name: "Authorise" }) });
    if (await row.count()) {
      await row.getByRole("button", { name: "Authorise" }).click();
      await expectTxConfirmed(admin, new RegExp(`${label}: confirmed on-chain`));
    }
    await expect(admin.getByRole("row", { name: new RegExp(name) }).getByRole("button", { name: "Revoke" })).toBeVisible();
  }
});

test("2. NGO creates a school construction campaign with three milestones", async () => {
  const ngo = await as("ngo");
  await ngo.goto("/ngo/campaigns/new");
  await expect(ngo.getByRole("heading", { name: "Create campaign" })).toBeVisible();

  // Client-side validation blocks a mismatched allocation before any upload or gas.
  await ngo.getByLabel("Title").fill(title);
  await ngo.getByLabel("Description").fill("Build three classrooms and sanitation for 240 pupils. End-to-end test campaign.");
  await ngo.getByLabel("Beneficiary wallet").fill(addr.beneficiary);
  await ngo.locator("#verifier").selectOption(addr.verifier);
  await ngo.getByLabel("Target (ETH)").fill("0.3");
  await ngo.locator("#endDate").fill(new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10));
  await ngo.locator("#m-0-d").fill("Foundation and site preparation");
  await ngo.locator("#m-0-a").fill("0.1");
  await ngo.locator("#m-1-d").fill("Walls and roof");
  await ngo.locator("#m-1-a").fill("0.1");
  await ngo.getByRole("button", { name: "Add milestone" }).click();
  await ngo.locator("#m-2-d").fill("Desks and blackboards");
  await ngo.locator("#m-2-a").fill("0.05");
  await ngo.getByRole("button", { name: "Upload metadata & continue" }).click();
  await expect(ngo.getByText("Milestone allocations must add up exactly to the target")).toBeVisible();

  await ngo.locator("#m-1-a").fill("0.15");
  await ngo.locator("#cover").setInputFiles({ name: "school.png", mimeType: "image/png", buffer: PNG });
  await ngo.getByRole("button", { name: "Upload metadata & continue" }).click();
  await expect(ngo.getByText("Metadata stored")).toBeVisible();
  await expect(ngo.getByText(/Local dev storage · not IPFS|IPFS/).first()).toBeVisible();

  await ngo.getByRole("button", { name: "Create campaign in MetaMask" }).click();
  await ngo.waitForURL(/\/ngo\/campaigns\/\d+$/, { timeout: 60_000 });
  campaignId = Number(ngo.url().split("/").pop());
  await expect(ngo.getByRole("heading", { name: title })).toBeVisible();
  await expect(ngo.getByText("Accepting donations")).toBeVisible();
});

test("3. donor connects the wallet and donates; funds are locked in escrow", async () => {
  const donor = await as("donor");
  await donor.goto(`/campaigns/${campaignId}`);
  await donor.getByLabel("Amount (ETH)").fill("5");
  await donor.getByRole("button", { name: /^Donate/ }).click();
  await expect(donor.getByText(/At most 0.3 ETH can still be donated/)).toBeVisible();

  const before = BigInt(await rpc<string>("eth_getBalance", [addr.donor, "latest"]));
  await donor.getByLabel("Amount (ETH)").fill("0.2");
  await donor.getByRole("button", { name: /^Donate 0.2 ETH/ }).click();
  await donor.getByRole("button", { name: "Confirm in MetaMask" }).click();
  await expectTxConfirmed(donor, "Donation confirmed on-chain and locked in escrow. Thank you!");
  await expect(donor.getByRole("status").getByRole("link", { name: /^0x/ })).toBeVisible();
  const after = BigInt(await rpc<string>("eth_getBalance", [addr.donor, "latest"]));
  expect(before - after).toBeGreaterThanOrEqual(200000000000000000n);

  const { campaign } = await apiGet<{ campaign: { totalDonatedWei: string; escrowWei: string; totalReleasedWei: string } }>(`/campaigns/${campaignId}`);
  expect(campaign).toMatchObject({ totalDonatedWei: "200000000000000000", escrowWei: "200000000000000000", totalReleasedWei: "0" });
});

test("4. NGO uploads evidence and records its CID + SHA-256 on-chain", async () => {
  const ngo = await as("ngo");
  await ngo.goto(`/ngo/campaigns/${campaignId}/milestones`);
  await ngo.getByRole("link", { name: "Submit evidence" }).first().click();
  await expect(ngo).toHaveURL(new RegExp(`/ngo/campaigns/${campaignId}/milestones/0/evidence`));

  await ngo.locator("#files").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(ngo.getByText(/not an allowed type/)).toBeVisible();
  await ngo.getByRole("button", { name: "Remove notes.txt" }).click();

  await ngo.locator("#files").setInputFiles([
    { name: "foundation.jpg", mimeType: "image/jpeg", buffer: JPG },
    { name: "cement-receipt.pdf", mimeType: "application/pdf", buffer: PDF },
  ]);
  await ngo.getByLabel(/Note for the verifier/).fill("Foundation poured; cement invoice attached.");
  await ngo.getByRole("button", { name: "Upload & hash files" }).click();
  await expect(ngo.getByText("Step 2 · Record evidence on-chain")).toBeVisible();
  await ngo.getByRole("button", { name: "Submit evidence in MetaMask" }).click();
  await expectTxConfirmed(ngo, /Evidence recorded on-chain/);
});

test("5. verifier inspects the evidence, approves and releases the milestone", async () => {
  const v = await as("verifier");
  await v.goto("/verifier/pending");
  const row = v.getByRole("row", { name: new RegExp(title) });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Review" }).click();

  await expect(v.getByText("foundation.jpg")).toBeVisible();
  await v.getByRole("button", { name: "Verify file hashes against the chain" }).click();
  await expect(v.getByText("Evidence matches the on-chain hash")).toBeVisible();

  await v.getByRole("button", { name: "Approve", exact: true }).click();
  await v.getByRole("button", { name: "Approve in MetaMask" }).click();
  await expectTxConfirmed(v, "Approve milestone: confirmed on-chain.");

  const beneficiaryBefore = BigInt(await rpc<string>("eth_getBalance", [addr.beneficiary, "latest"]));
  await v.getByRole("button", { name: /^Release 0.1 ETH/ }).click();
  await v.getByRole("button", { name: "Confirm in MetaMask" }).click();
  await expectTxConfirmed(v, "0.1 ETH released to the beneficiary.");
  const beneficiaryAfter = BigInt(await rpc<string>("eth_getBalance", [addr.beneficiary, "latest"]));
  expect(beneficiaryAfter - beneficiaryBefore).toBe(100000000000000000n);

  // The release control is gone: the milestone cannot be released twice.
  await v.reload();
  await expect(v.getByText(/Funds released on/)).toBeVisible();
  await expect(v.getByRole("button", { name: /^Release/ })).toHaveCount(0);
});

test("6. donor sees the release in their history", async () => {
  const donor = await as("donor");
  await ensureAccount(donor, "E2E Donor", "Donor");
  await donor.goto("/donor");
  await expect(donor.getByText("You donated")).toBeVisible();
  await expect(donor.getByText(/released/).first()).toBeVisible();
  await donor.goto("/donor/donations");
  await expect(donor.getByRole("row", { name: new RegExp(title) }).first()).toBeVisible();
  await donor.getByRole("link", { name: "Details" }).first().click();
  await expect(donor.getByText("What happened since your donation")).toBeVisible();
  await expect(donor.getByText(/0.1 ETH released/)).toBeVisible();
});

test("7. a public visitor without a wallet sees the full transparent history", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/campaigns/${campaignId}/transparency`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(/figures read live from the contract/)).toBeVisible();
  const stat = (label: string) => page.locator("div", { has: page.getByText(label, { exact: true }) }).locator("p.text-xl").first();
  await expect(stat("Total donated")).toHaveText("0.2 ETH");
  await expect(stat("Held in escrow")).toHaveText("0.1 ETH");
  await expect(stat("Released")).toHaveText("0.1 ETH");
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Funds released").first()).toBeVisible();
  await expect(page.getByText(/Donation of 0.2 ETH locked in escrow/)).toBeVisible();
  await expect(page.getByText(/Milestone 1: 0.1 ETH released/)).toBeVisible();
});
