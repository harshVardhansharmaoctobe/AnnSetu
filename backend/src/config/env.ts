import "dotenv/config";
import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/trustchain"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("12h"),
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),

  // Blockchain (read-only access; the backend never signs transactions)
  RPC_URL: z.string().default("http://127.0.0.1:8545"),
  CHAIN_ID: z.coerce.number().int().positive().default(31337),
  CONTRACT_ADDRESS: optionalString,
  CONTRACT_DEPLOY_BLOCK: z.coerce.number().int().nonnegative().optional(),
  INDEXER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  INDEXER_POLL_MS: z.coerce.number().int().positive().default(4000),
  INDEXER_BLOCK_CHUNK: z.coerce.number().int().positive().default(2000),
  INDEXER_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(0),

  // IPFS
  IPFS_PROVIDER: z.enum(["pinata", "kubo", "local"]).default("local"),
  IPFS_API_URL: optionalString, // pinata: https://api.pinata.cloud | kubo: http://127.0.0.1:5001
  IPFS_JWT: optionalString, // pinata JWT (preferred)
  IPFS_API_KEY: optionalString, // pinata API key (alternative to JWT)
  IPFS_API_SECRET: optionalString,
  IPFS_GATEWAY_URL: z.string().default("https://gateway.pinata.cloud/ipfs"),
  LOCAL_STORAGE_DIR: z.string().default(".data/local-storage"),
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),

  // Upload limits
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(10),
  MAX_FILES_PER_UPLOAD: z.coerce.number().int().positive().default(6),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid backend environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = load();
