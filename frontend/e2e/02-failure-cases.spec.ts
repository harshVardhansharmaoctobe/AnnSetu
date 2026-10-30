/** Failure and edge cases, exercised through the UI against the running stack. */
import { expect, test } from "@playwright/test";
import { hardhatAccount, walletContext } from "./wallet";
import { apiGet, ensureAccount } from "./helpers";

interface CampaignSummary {
  id: number;
  active: boolean;
  ended: boolean;
  targetWei: string;
  totalDonatedWei: string;
  ngo: { address: string };
  milestones: { status: string }[];
}

async function openCampaign(): Promise<CampaignSummary> {
  const { campaigns } = await apiGet<{ campaigns: CampaignSummary[] }>("/campaigns?state=active");
  const c = campaigns.find((x) => BigInt(x.targetWei) > BigInt(x.totalDonatedWei));
  test.skip(!c, "Needs an active, not fully funded campaign (run `npm run seed:local`)");
  return c!;
}

test("wrong network: banner + donate disabled until the wallet switches", async ({ browser }) => {
  const c = await openCampaign();
  const page = await (await walletContext(browser, await hardhatAccount(14), { chainId: 1 })).newPage();
  await page.goto(`/campaigns/${c.id}`);
  await expect(page.getByText("Wrong network")).toBeVisible();
  await expect(page.getByRole("button", { name: /Switch to Local Hardhat/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Donate/ })).toHaveCount(0);
});

test("wallet rejection: nothing is sent and the user is told so", async ({ browser }) => {
  const c = await openCampaign();
  const page = await (await walletContext(browser, await hardhatAccount(14), { rejectTransactions: true })).newPage();
  await page.goto(`/campaigns/${c.id}`);
  await page.getByLabel("Amount (ETH)").fill("0.001");
  await page.getByRole("button", { name: /^Donate/ }).click();
  await page.getByRole("button", { name: "Confirm in MetaMask" }).click();
  await expect(page.getByText("Donation failed")).toBeVisible();
  await expect(page.getByText(/You rejected the request in your wallet/)).toBeVisible();
  await expect(page.getByText(/Donation confirmed/)).toHaveCount(0);
});

test("insufficient funds: an empty wallet gets a clear error, no success", async ({ browser }) => {
  const c = await openCampaign();
  const page = await (await walletContext(browser, "0x000000000000000000000000000000000000dead")).newPage();
  await page.goto(`/campaigns/${c.id}`);
  await page.getByLabel("Amount (ETH)").fill("0.001");
  await page.getByRole("button", { name: /^Donate/ }).click();
  await page.getByRole("button", { name: "Confirm in MetaMask" }).click();
  await expect(page.getByText("Donation failed")).toBeVisible();
  await expect(page.getByText(/Donation confirmed/)).toHaveCount(0);
});

test("no MetaMask installed: donation explains what is needed", async ({ browser }) => {
  const c = await openCampaign();
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/campaigns/${c.id}`);
  await expect(page.getByText("MetaMask required")).toBeVisible();
});

test("unauthorised roles: a donor cannot open NGO, verifier or admin dashboards", async ({ browser }) => {
  const page = await (await walletContext(browser, await hardhatAccount(15))).newPage();
  await ensureAccount(page, "E2E Curious Donor", "Donor");
  await page.goto("/ngo");
  await expect(page.getByText("This area is for NGOs")).toBeVisible();
  await page.goto("/verifier/pending");
  await expect(page.getByText("This area is for verifiers")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText("This area is for platform admins")).toBeVisible();
});

test("NGO applicant without on-chain approval sees the pending-approval explanation", async ({ browser }) => {
  const page = await (await walletContext(browser, await hardhatAccount(16))).newPage();
  await ensureAccount(page, "E2E Pending NGO", "NGO", "Pending Org");
  await page.goto("/ngo/campaigns/new");
  await expect(page.getByText(/A platform admin must authorise your wallet on-chain/)).toBeVisible();
});

test("another NGO cannot manage someone else's campaign", async ({ browser }) => {
  const c = await openCampaign();
  const other = await hardhatAccount(10); // NGO from the full-flow spec
  if (other === c.ngo.address) test.skip(true, "Campaign belongs to the same NGO");
  const page = await (await walletContext(browser, other)).newPage();
  await ensureAccount(page, "E2E Hope Builders", "NGO", "Hope Builders E2E");
  await page.goto(`/ngo/campaigns/${c.id}/milestones`);
  await expect(page.getByText(/Not your campaign|This area is for NGOs/)).toBeVisible();
});

test("backend unavailable: clear banner and error states, no fake data", async ({ browser }) => {
  const context = await browser.newContext();
  await context.route(/:4000\/api\//, (route) => route.abort());
  const page = await context.newPage();
  await page.goto("/campaigns");
  await expect(page.getByText("TrustChain API unavailable")).toBeVisible();
  await expect(page.getByText("Something went wrong")).toBeVisible();
});

test("empty and invalid states", async ({ page }) => {
  await page.goto("/campaigns?q=zz-no-such-campaign-zz");
  await expect(page.getByText("No campaigns match your filters")).toBeVisible();
  await page.goto("/campaigns/999999");
  await expect(page.getByText("Campaign not found")).toBeVisible();
  await page.goto("/tx/0x1234");
  await expect(page.getByText("Invalid transaction hash")).toBeVisible();
});

test("mobile layout has no horizontal scrolling", async ({ browser }) => {
  const c = await openCampaign();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  for (const path of ["/", "/campaigns", `/campaigns/${c.id}`, `/campaigns/${c.id}/transparency`, "/login", "/register"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});
