import deployments from "@/contracts/deployments.json";

interface Deployment {
  address: string;
  chainId: number;
  deployBlock: number;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum Mainnet",
  11155111: "Sepolia Testnet",
  31337: "Local Hardhat",
};

const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? 31337);
const deployment = (deployments as Record<string, Deployment>)[String(chainId)];

export const config = {
  apiUrl: (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/$/, ""),
  chainId,
  chainName: CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
  contractAddress: (import.meta.env.VITE_CONTRACT_ADDRESS || deployment?.address || "") as string,
  explorerUrl: (import.meta.env.VITE_EXPLORER_URL ?? "").replace(/\/$/, ""),
  rpcUrl: import.meta.env.VITE_RPC_URL || (chainId === 31337 ? "http://127.0.0.1:8545" : ""),
  isLocalChain: chainId === 31337,
};

export const explorerTxUrl = (hash: string) => (config.explorerUrl ? `${config.explorerUrl}/tx/${hash}` : null);
export const explorerAddressUrl = (address: string) =>
  config.explorerUrl ? `${config.explorerUrl}/address/${address}` : null;
