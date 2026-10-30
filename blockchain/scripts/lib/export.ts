import fs from "node:fs";
import path from "node:path";

export interface DeploymentRecord {
  network: string;
  chainId: number;
  address: string;
  deployBlock: number;
  admin: string;
  deployer: string;
  txHash: string;
  deployedAt: string;
}

const ROOT = path.resolve(__dirname, "..", "..", "..");
const DEPLOYMENTS_DIR = path.resolve(__dirname, "..", "..", "deployments");
const TARGETS = [path.join(ROOT, "backend", "contract"), path.join(ROOT, "frontend", "src", "contracts")];

export function saveDeployment(record: DeploymentRecord) {
  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEPLOYMENTS_DIR, `${record.network}.json`), JSON.stringify(record, null, 2) + "\n");
}

/** Copy the ABI and every known deployment (keyed by chain id) to the backend and frontend. */
export function exportArtifacts() {
  const artifactPath = path.resolve(__dirname, "..", "..", "artifacts", "contracts", "TrustChain.sol", "TrustChain.json");
  if (!fs.existsSync(artifactPath)) throw new Error("TrustChain artifact missing — run `npx hardhat compile` first");
  const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const deployments: Record<string, DeploymentRecord> = {};
  if (fs.existsSync(DEPLOYMENTS_DIR)) {
    for (const file of fs.readdirSync(DEPLOYMENTS_DIR).filter((f) => f.endsWith(".json"))) {
      const rec: DeploymentRecord = JSON.parse(fs.readFileSync(path.join(DEPLOYMENTS_DIR, file), "utf8"));
      deployments[String(rec.chainId)] = rec;
    }
  }

  for (const dir of TARGETS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "TrustChain.abi.json"), JSON.stringify(abi, null, 2) + "\n");
    fs.writeFileSync(path.join(dir, "deployments.json"), JSON.stringify(deployments, null, 2) + "\n");
  }
  return { targets: TARGETS, chains: Object.keys(deployments) };
}
