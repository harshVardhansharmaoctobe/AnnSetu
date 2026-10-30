/**
 * LOCAL DEMO SEED — Hardhat node only (chain 31337).
 *
 * Uses the Hardhat node's unlocked development accounts over JSON-RPC (no private keys in code)
 * and the real backend services, so every step is a real, verified on-chain transaction:
 *   1. admin authorises the demo NGO and verifier wallets
 *   2. demo user profiles are created and flagged isDemo (shown as "Demo data" in the UI)
 *   3. (--with-campaign) the NGO prepares metadata and creates a 3-milestone campaign
 *   4. (--with-campaign) a demo donor donates
 *
 * Usage: npm run seed:demo [-- --with-campaign]
 */
import { Contract, JsonRpcProvider, parseEther } from "ethers";
import { TRUSTCHAIN_ABI, chainConfig } from "../src/config/chain.js";
import { connectDb, disconnectDb } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { Campaign } from "../src/models/Campaign.js";
import { User } from "../src/models/User.js";
import { createDraft } from "../src/services/campaignService.js";
import { syncOnce } from "../src/services/indexerService.js";
import { verifyAndIndexTx } from "../src/services/txVerificationService.js";

const withCampaign = process.argv.includes("--with-campaign");

if (chainConfig.chainId !== 31337) {
  console.error("seed:demo only runs against a local Hardhat node (CHAIN_ID=31337).");
  process.exit(1);
}
if (!chainConfig.contractAddress) {
  console.error("No contract address. Run `npm run deploy:local` first.");
  process.exit(1);
}

const provider = new JsonRpcProvider(env.RPC_URL, 31337, { staticNetwork: true });
const [admin, ngo, verifier, donor, beneficiary] = await Promise.all([0, 1, 2, 3, 4].map((i) => provider.getSigner(i)));
const as = (s: typeof admin) => new Contract(chainConfig.contractAddress!, TRUSTCHAIN_ABI as never, s);
const addr = async (s: typeof admin) => (await s.getAddress()).toLowerCase();

async function send(label: string, txPromise: Promise<{ hash: string; wait: () => Promise<unknown> }>) {
  const tx = await txPromise;
  await tx.wait();
  await verifyAndIndexTx(tx.hash);
  console.log(`  ✓ ${label}  ${tx.hash}`);
}

await connectDb(env.MONGODB_URI);
await syncOnce();

const people = [
  { signer: admin, name: "Platform Admin (demo)", organization: "TrustChain", requestedRole: "DONOR" },
  { signer: ngo, name: "Hope Builders Foundation (demo)", organization: "Hope Builders Foundation", requestedRole: "NGO" },
  { signer: verifier, name: "Independent Audit Co. (demo)", organization: "Independent Audit Co.", requestedRole: "VERIFIER" },
  { signer: donor, name: "Alice Donor (demo)", organization: undefined, requestedRole: "DONOR" },
  { signer: beneficiary, name: "Kisumu School Building Account (demo)", organization: "Kisumu Community School", requestedRole: "DONOR" },
] as const;

console.log("Demo accounts (Hardhat dev accounts — import into MetaMask with the keys printed by `npx hardhat node`):");
for (const p of people) {
  const address = await addr(p.signer);
  await User.updateOne(
    { address },
    { $setOnInsert: { address, name: p.name, organization: p.organization, requestedRole: p.requestedRole, isDemo: true } },
    { upsert: true },
  );
  console.log(`  ${p.name.padEnd(42)} ${address}`);
}

const tc = as(admin);
console.log("\nOn-chain roles:");
if (!(await tc.isNGO(await addr(ngo)))) await send("registerNGO", tc.registerNGO(await addr(ngo)));
else console.log("  · NGO already authorised");
if (!(await tc.isVerifier(await addr(verifier)))) await send("registerVerifier", tc.registerVerifier(await addr(verifier)));
else console.log("  · verifier already authorised");

if (withCampaign) {
  console.log("\nDemo campaign:");
  const draft = await createDraft(await addr(ngo), {
    title: "Kisumu Community School — new classroom block",
    description:
      "DEMO CAMPAIGN (seeded test data). Build a three-classroom block for 240 pupils at Kisumu Community School. " +
      "Funds are released in three stages: foundation, walls and roof, and furniture. Each stage is paid only after an independent auditor reviews photos and receipts.",
    beneficiary: await addr(beneficiary),
    verifier: await addr(verifier),
    targetWei: parseEther("0.3"),
    endDate: new Date(Date.now() + 45 * 24 * 3600 * 1000),
    milestones: [
      { description: "Site preparation and foundation", amountWei: parseEther("0.1") },
      { description: "Walls, roof and windows", amountWei: parseEther("0.15") },
      { description: "Desks, chairs and blackboards", amountWei: parseEther("0.05") },
    ],
  });
  await Campaign.updateOne({ _id: draft.draftId }, { $set: { isDemo: true } });
  const a = draft.contractArgs;
  await send(
    "createCampaign",
    as(ngo).createCampaign(a.title, a.metadataCID, a.beneficiary, a.verifier, a.targetAmount, a.deadline, a.milestoneDescriptions, a.milestoneAmounts),
  );
  const linked = await Campaign.findById(draft.draftId);
  await send("donate 0.12 ETH", as(donor).donate(linked!.campaignId, { value: parseEther("0.12") }));
  console.log(`  Campaign #${linked!.campaignId} ready: http://localhost:5173/campaigns/${linked!.campaignId}`);
}

await disconnectDb();
provider.destroy();
console.log("\nDone.");
