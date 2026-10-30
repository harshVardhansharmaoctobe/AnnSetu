/**
 * Starts the real dependencies once for the whole API test run:
 *  - an in-memory MongoDB (mongodb-memory-server)
 *  - a dedicated Hardhat JSON-RPC node on port 8547 with a freshly deployed TrustChain contract
 * and exposes them to the test workers through environment variables.
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider } from "ethers";
import { MongoMemoryServer } from "mongodb-memory-server";

const RPC_PORT = 8547;
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;
const blockchainDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "blockchain");

let mongo: MongoMemoryServer | undefined;
let node: ChildProcess | undefined;

async function waitForRpc(provider: JsonRpcProvider, timeoutMs = 60_000) {
  const started = Date.now();
  for (;;) {
    try {
      await provider.send("eth_chainId", []);
      return;
    } catch {
      if (Date.now() - started > timeoutMs) throw new Error("Hardhat node did not start in time");
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

export async function setup() {
  const artifactPath = path.join(blockchainDir, "artifacts", "contracts", "TrustChain.sol", "TrustChain.json");
  if (!fs.existsSync(artifactPath)) throw new Error("Compile the contract first: npm --prefix ../blockchain run compile");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  mongo = await MongoMemoryServer.create();

  node = spawn("npx", ["hardhat", "node", "--port", String(RPC_PORT)], {
    cwd: blockchainDir,
    shell: true,
    stdio: "ignore",
  });
  const provider = new JsonRpcProvider(RPC_URL, 31337, { staticNetwork: true });
  await waitForRpc(provider);

  const admin = await provider.getSigner(0);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, admin);
  const contract = await factory.deploy(await admin.getAddress());
  const receipt = await contract.deploymentTransaction()!.wait();
  provider.destroy();

  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustchain-test-storage-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    MONGODB_URI: mongo.getUri("trustchain-test"),
    JWT_SECRET: "test-secret-test-secret-test-secret",
    RPC_URL,
    CHAIN_ID: "31337",
    CONTRACT_ADDRESS: await contract.getAddress(),
    CONTRACT_DEPLOY_BLOCK: String(receipt!.blockNumber),
    INDEXER_ENABLED: "false",
    IPFS_PROVIDER: "local",
    LOCAL_STORAGE_DIR: storageDir,
    PUBLIC_API_URL: "http://localhost:4000",
    MAX_FILE_SIZE_MB: "1",
    TEST_RPC_URL: RPC_URL,
  });
}

export async function teardown() {
  if (node?.pid) {
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${node.pid} /T /F`, { stdio: "ignore" });
      else process.kill(-node.pid);
    } catch {
      node.kill();
    }
  }
  await mongo?.stop();
}
