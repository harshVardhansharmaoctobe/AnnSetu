/**
 * Local development MongoDB.
 *
 * Starts a real `mongod` binary (downloaded once by mongodb-memory-server) on port 27017,
 * with data persisted to backend/.data/mongo. Use this only when no MongoDB server/Atlas URI
 * is available. Stop with Ctrl+C.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

const port = Number(process.env.DEV_DB_PORT ?? 27017);
const dbPath = path.resolve(process.cwd(), ".data/mongo");
mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: { port, dbPath, storageEngine: "wiredTiger" },
});

console.log(`[dev-db] MongoDB running at ${server.getUri()} (data: ${dbPath})`);
console.log("[dev-db] Set MONGODB_URI=mongodb://127.0.0.1:27017/trustchain in backend/.env");

const shutdown = async () => {
  await server.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
