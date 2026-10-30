import { Contract, JsonRpcProvider, type JsonRpcSigner, parseEther } from "ethers";
import request from "supertest";
import type { Express } from "express";
import { TRUSTCHAIN_ABI } from "../src/config/chain.js";

export const provider = new JsonRpcProvider(process.env.TEST_RPC_URL, 31337, { staticNetwork: true });

/** Hardhat node accounts (unlocked): 0 admin, 1 ngo, 2 verifier, 3 donor, 4 beneficiary, 5 outsider, 6 second NGO, 7 second verifier. */
export async function accounts() {
  const [admin, ngo, verifier, donor, beneficiary, outsider, ngo2, verifier2] = await Promise.all(
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => provider.getSigner(i)),
  );
  return { admin, ngo, verifier, donor, beneficiary, outsider, ngo2, verifier2 };
}

export const contractAs = (signer: JsonRpcSigner) => new Contract(process.env.CONTRACT_ADDRESS!, TRUSTCHAIN_ABI as never, signer);

/** Sign in through the real nonce → personal_sign → register/login flow. */
export async function signIn(app: Express, signer: JsonRpcSigner, profile?: { name?: string; requestedRole?: string }) {
  const address = await signer.getAddress();
  const nonce = await request(app).post("/api/auth/nonce").send({ address }).expect(200);
  const signature = await signer.signMessage(nonce.body.message);
  const reg = await request(app)
    .post("/api/auth/register")
    .send({ address, signature, name: profile?.name ?? `User ${address.slice(2, 8)}`, requestedRole: profile?.requestedRole ?? "DONOR" });
  if (reg.status === 201) return reg.body.token as string;

  const nonce2 = await request(app).post("/api/auth/nonce").send({ address }).expect(200);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ address, signature: await signer.signMessage(nonce2.body.message) })
    .expect(200);
  return login.body.token as string;
}

export async function ensureRoles() {
  const { admin, ngo, verifier, ngo2, verifier2 } = await accounts();
  const tc = contractAs(admin);
  for (const s of [ngo, ngo2]) if (!(await tc.isNGO(await s.getAddress()))) await (await tc.registerNGO(await s.getAddress())).wait();
  for (const s of [verifier, verifier2]) {
    if (!(await tc.isVerifier(await s.getAddress()))) await (await tc.registerVerifier(await s.getAddress())).wait();
  }
}

// Minimal files with valid signatures for each allowed type.
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-png-body")]);
export const PDF = Buffer.from("%PDF-1.4\n% receipt for cement bags\n%%EOF\n");
export const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("jpeg-body")]);

export const draftFields = (o: { beneficiary: string; verifier: string; target?: string; milestones?: { description: string; amountEth: string }[] }) => ({
  title: "Build a primary school in Kisumu",
  description: "Construction of a three-classroom primary school serving 240 children in Kisumu county.",
  beneficiary: o.beneficiary,
  verifier: o.verifier,
  targetEth: o.target ?? "0.3",
  endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  milestones: JSON.stringify(
    o.milestones ?? [
      { description: "Foundation and site preparation", amountEth: "0.1" },
      { description: "Walls and roof", amountEth: "0.15" },
      { description: "Furniture and books", amountEth: "0.05" },
    ],
  ),
});

export const ETH = (v: string) => parseEther(v);
