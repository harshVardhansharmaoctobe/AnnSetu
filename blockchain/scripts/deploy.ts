import { ethers, network } from "hardhat";
import { exportArtifacts, saveDeployment } from "./lib/export";

const EXPECTED_CHAIN_IDS: Record<string, number> = { hardhat: 31337, localhost: 31337, sepolia: 11155111 };

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  const expected = EXPECTED_CHAIN_IDS[network.name];
  if (expected !== undefined && Number(chainId) !== expected) {
    throw new Error(`Chain id mismatch: network "${network.name}" expects ${expected} but RPC reports ${chainId}`);
  }

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      `No deployer account for "${network.name}". Set DEPLOYER_PRIVATE_KEY in blockchain/.env (testnet key only).`,
    );
  }
  const deployer = signers[0];
  const admin = process.env.ADMIN_ADDRESS && ethers.isAddress(process.env.ADMIN_ADDRESS) ? process.env.ADMIN_ADDRESS : deployer.address;
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network:   ${network.name} (chainId ${chainId})`);
  console.log(`Deployer:  ${deployer.address}  balance ${ethers.formatEther(balance)} ETH`);
  console.log(`Admin:     ${admin}`);
  if (balance === 0n) throw new Error("Deployer has no ETH. Fund it from a Sepolia faucet first.");

  const factory = await ethers.getContractFactory("TrustChain", deployer);
  const contract = await factory.deploy(admin);
  const deployTx = contract.deploymentTransaction();
  console.log(`Deploy tx: ${deployTx?.hash} — waiting for confirmation...`);
  const receipt = await deployTx!.wait(network.name === "sepolia" ? 2 : 1);
  if (!receipt || receipt.status !== 1) throw new Error("Deployment transaction failed");

  const address = await contract.getAddress();
  saveDeployment({
    network: network.name,
    chainId: Number(chainId),
    address,
    deployBlock: receipt.blockNumber,
    admin,
    deployer: deployer.address,
    txHash: receipt.hash,
    deployedAt: new Date().toISOString(),
  });
  const exported = exportArtifacts();

  console.log(`\nTrustChain deployed at ${address} (block ${receipt.blockNumber})`);
  console.log(`ABI + deployments exported to:\n  ${exported.targets.join("\n  ")}`);
  if (network.name === "sepolia") {
    console.log(`Explorer: https://sepolia.etherscan.io/address/${address}`);
    console.log(`Verify (optional): npx hardhat verify --network sepolia ${address} ${admin}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
