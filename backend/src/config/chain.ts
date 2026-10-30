import fs from "node:fs";
import { Contract, Interface, JsonRpcProvider, getAddress, isAddress } from "ethers";
import { env } from "./env.js";
import { unavailable } from "../utils/errors.js";

const CONTRACT_DIR = new URL("../../contract/", import.meta.url);

function readJson<T>(name: string, fallback: T): T {
  const file = new URL(name, CONTRACT_DIR);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export const TRUSTCHAIN_ABI = readJson<unknown[]>("TrustChain.abi.json", []);
export const trustChainInterface = new Interface(TRUSTCHAIN_ABI as never);

interface DeploymentRecord {
  address: string;
  deployBlock: number;
  chainId: number;
}

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  contractAddress: string | null;
  deployBlock: number;
}

/** Resolved once per process: env CONTRACT_ADDRESS wins, else the exported deployment for CHAIN_ID. */
function resolveChainConfig(): ChainConfig {
  const deployments = readJson<Record<string, DeploymentRecord>>("deployments.json", {});
  const deployment = deployments[String(env.CHAIN_ID)];
  const raw = env.CONTRACT_ADDRESS ?? deployment?.address ?? null;
  if (raw && !isAddress(raw)) throw new Error(`CONTRACT_ADDRESS "${raw}" is not a valid address`);
  const contractAddress = raw ? getAddress(raw) : null;
  const sameAsDeployment = deployment && contractAddress && getAddress(deployment.address) === contractAddress;
  return {
    chainId: env.CHAIN_ID,
    rpcUrl: env.RPC_URL,
    contractAddress,
    deployBlock: env.CONTRACT_DEPLOY_BLOCK ?? (sameAsDeployment ? deployment.deployBlock : 0),
  };
}

export const chainConfig = resolveChainConfig();

let provider: JsonRpcProvider | null = null;
let readContract: Contract | null = null;

export function getProvider(): JsonRpcProvider {
  if (!provider) {
    provider = new JsonRpcProvider(chainConfig.rpcUrl, chainConfig.chainId, { staticNetwork: true, polling: false });
  }
  return provider;
}

/** Read-only contract instance. The backend never holds a signer. */
export function getContract(): Contract {
  if (!chainConfig.contractAddress) {
    throw unavailable("TrustChain contract address is not configured (deploy the contract or set CONTRACT_ADDRESS)");
  }
  if (TRUSTCHAIN_ABI.length === 0) throw unavailable("TrustChain ABI is missing (run the blockchain export script)");
  if (!readContract) readContract = new Contract(chainConfig.contractAddress, TRUSTCHAIN_ABI as never, getProvider());
  return readContract;
}

export function contractScope() {
  if (!chainConfig.contractAddress) throw unavailable("TrustChain contract address is not configured");
  return { chainId: chainConfig.chainId, contractAddress: chainConfig.contractAddress };
}

/** Verifies the RPC endpoint's chain id and that contract code exists. */
export async function checkChain(): Promise<{ ok: boolean; reason?: string; latestBlock?: number }> {
  try {
    const p = getProvider();
    const chainIdHex: string = await p.send("eth_chainId", []);
    if (Number(chainIdHex) !== chainConfig.chainId) {
      return { ok: false, reason: `RPC chain id ${Number(chainIdHex)} does not match CHAIN_ID ${chainConfig.chainId}` };
    }
    if (!chainConfig.contractAddress) return { ok: false, reason: "Contract address not configured" };
    const code = await p.getCode(chainConfig.contractAddress);
    if (code === "0x") return { ok: false, reason: `No contract code at ${chainConfig.contractAddress}` };
    return { ok: true, latestBlock: await p.getBlockNumber() };
  } catch (err) {
    return { ok: false, reason: `RPC unreachable: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}` };
  }
}

/** Replace the cached provider/contract (tests only). */
export function resetChainClients() {
  provider?.destroy();
  provider = null;
  readContract = null;
}
