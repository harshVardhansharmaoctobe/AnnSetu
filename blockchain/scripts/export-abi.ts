import { exportArtifacts } from "./lib/export";

const { targets, chains } = exportArtifacts();
console.log(`Exported ABI and deployments (chains: ${chains.join(", ") || "none"}) to:\n  ${targets.join("\n  ")}`);
