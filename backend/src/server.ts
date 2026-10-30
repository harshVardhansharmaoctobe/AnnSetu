import { createApp } from "./app.js";
import { chainConfig, checkChain } from "./config/chain.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { startIndexer, stopIndexer } from "./services/indexerService.js";
import { storageStatus } from "./services/ipfsService.js";
import { logger } from "./utils/logger.js";

async function main() {
  await connectDb(env.MONGODB_URI);

  const chain = await checkChain();
  logger.info("chain", `chainId ${chainConfig.chainId}, contract ${chainConfig.contractAddress ?? "(not configured)"}`);
  if (!chain.ok) logger.warn("chain", `Blockchain not ready: ${chain.reason}. Chain-backed endpoints will return 503 until it is.`);

  const storage = storageStatus();
  logger.info("storage", `Provider: ${storage.provider}${storage.warning ? ` — ${storage.warning}` : ""}`);

  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info("server", `TrustChain API listening on http://localhost:${env.PORT}`));

  if (env.INDEXER_ENABLED) void startIndexer();

  const shutdown = () => {
    stopIndexer();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("server", "Failed to start", err);
  process.exit(1);
});
