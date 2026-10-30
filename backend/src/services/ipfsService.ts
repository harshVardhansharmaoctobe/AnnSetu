import fs from "node:fs/promises";
import path from "node:path";
import { CID } from "multiformats/cid";
import { env } from "../config/env.js";
import { HttpError, unavailable } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { sha256Hex } from "../utils/chain.js";

export type StorageProvider = "pinata" | "kubo" | "local";

export interface StoredObject {
  ref: string; // IPFS CID, or local://sha256-<hex> for the dev fallback
  provider: StorageProvider;
  sha256: string; // hex, no 0x
  size: number;
  mime: string;
  name: string;
}

export const LOCAL_REF_PREFIX = "local://sha256-";
const LOCAL_REF_RE = /^local:\/\/sha256-([0-9a-f]{64})$/;
const UPLOAD_TIMEOUT_MS = 60_000;

export function isValidCid(value: string): boolean {
  try {
    CID.parse(value);
    return true;
  } catch {
    return false;
  }
}

/** A storage reference is either a real IPFS CID or an explicit local-dev reference. */
export function parseStorageRef(ref: string): { kind: "ipfs"; cid: string } | { kind: "local"; sha256: string } | null {
  const local = LOCAL_REF_RE.exec(ref);
  if (local) return { kind: "local", sha256: local[1] };
  if (isValidCid(ref)) return { kind: "ipfs", cid: CID.parse(ref).toString() };
  return null;
}

export function storageUrl(ref: string): string | null {
  const parsed = parseStorageRef(ref);
  if (!parsed) return null;
  if (parsed.kind === "local") return `${env.PUBLIC_API_URL.replace(/\/$/, "")}/api/storage/local/${parsed.sha256}`;
  return `${env.IPFS_GATEWAY_URL.replace(/\/$/, "")}/${parsed.cid}`;
}

export function storageStatus() {
  const provider = env.IPFS_PROVIDER;
  const configured =
    provider === "local" ||
    (provider === "pinata" && (!!env.IPFS_JWT || (!!env.IPFS_API_KEY && !!env.IPFS_API_SECRET))) ||
    (provider === "kubo" && !!env.IPFS_API_URL);
  return {
    provider,
    configured,
    isIpfs: provider !== "local",
    gateway: provider === "local" ? null : env.IPFS_GATEWAY_URL,
    warning:
      provider === "local"
        ? "Local development storage: files are stored on the API server and are NOT on IPFS."
        : configured
          ? null
          : `IPFS provider "${provider}" is selected but its credentials/URL are missing.`,
  };
}

function assertConfigured() {
  const status = storageStatus();
  if (!status.configured) throw unavailable(status.warning ?? "IPFS is not configured");
}

async function uploadPinata(data: Buffer, name: string, mime: string): Promise<string> {
  const base = (env.IPFS_API_URL ?? "https://api.pinata.cloud").replace(/\/$/, "");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: mime }), name);
  form.append("pinataMetadata", JSON.stringify({ name }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  const headers: Record<string, string> = env.IPFS_JWT
    ? { Authorization: `Bearer ${env.IPFS_JWT}` }
    : { pinata_api_key: env.IPFS_API_KEY!, pinata_secret_api_key: env.IPFS_API_SECRET! };
  const res = await fetch(`${base}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers,
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new HttpError(502, `Pinata upload failed (${res.status}): ${text}`, "IPFS_UPLOAD_FAILED");
  }
  const body = (await res.json()) as { IpfsHash?: string };
  if (!body.IpfsHash) throw new HttpError(502, "Pinata response did not include a CID", "IPFS_UPLOAD_FAILED");
  return body.IpfsHash;
}

async function uploadKubo(data: Buffer, name: string, mime: string): Promise<string> {
  const base = env.IPFS_API_URL!.replace(/\/$/, "");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: mime }), name);
  const headers: Record<string, string> = {};
  if (env.IPFS_API_KEY && env.IPFS_API_SECRET) {
    headers.Authorization = `Basic ${Buffer.from(`${env.IPFS_API_KEY}:${env.IPFS_API_SECRET}`).toString("base64")}`;
  }
  const res = await fetch(`${base}/api/v0/add?cid-version=1&pin=true`, {
    method: "POST",
    headers,
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new HttpError(502, `IPFS node upload failed (${res.status})`, "IPFS_UPLOAD_FAILED");
  }
  const body = (await res.json()) as { Hash?: string };
  if (!body.Hash) throw new HttpError(502, "IPFS node response did not include a CID", "IPFS_UPLOAD_FAILED");
  return body.Hash;
}

const localDir = () => path.resolve(process.cwd(), env.LOCAL_STORAGE_DIR);

async function storeLocal(data: Buffer, sha256: string, name: string, mime: string): Promise<string> {
  await fs.mkdir(localDir(), { recursive: true });
  await fs.writeFile(path.join(localDir(), sha256), data);
  await fs.writeFile(path.join(localDir(), `${sha256}.json`), JSON.stringify({ name, mime }));
  return `${LOCAL_REF_PREFIX}${sha256}`;
}

export async function readLocal(sha256: string): Promise<{ data: Buffer; mime: string; name: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
  try {
    const data = await fs.readFile(path.join(localDir(), sha256));
    const meta = JSON.parse(await fs.readFile(path.join(localDir(), `${sha256}.json`), "utf8"));
    return { data, mime: meta.mime, name: meta.name };
  } catch {
    return null;
  }
}

/** Upload bytes to the configured provider. Never silently falls back to another provider. */
export async function uploadBuffer(data: Buffer, name: string, mime: string): Promise<StoredObject> {
  assertConfigured();
  const sha256 = sha256Hex(data);
  const provider = env.IPFS_PROVIDER;
  let ref: string;
  try {
    if (provider === "pinata") ref = await uploadPinata(data, name, mime);
    else if (provider === "kubo") ref = await uploadKubo(data, name, mime);
    else ref = await storeLocal(data, sha256, name, mime);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    logger.error("ipfs", `Upload to ${provider} failed`, err);
    throw new HttpError(502, `Upload to ${provider} failed — the storage provider is unreachable`, "IPFS_UPLOAD_FAILED");
  }
  if (provider !== "local" && !isValidCid(ref)) {
    throw new HttpError(502, "Storage provider returned an invalid CID", "IPFS_UPLOAD_FAILED");
  }
  return { ref, provider, sha256, size: data.length, mime, name };
}

export async function uploadJson(value: unknown, name: string) {
  const data = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  return { stored: await uploadBuffer(data, name, "application/json"), data };
}

/** Fetch stored bytes back (used for evidence integrity checks). */
export async function fetchStored(ref: string): Promise<Buffer | null> {
  const parsed = parseStorageRef(ref);
  if (!parsed) return null;
  if (parsed.kind === "local") return (await readLocal(parsed.sha256))?.data ?? null;
  const url = storageUrl(ref)!;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    logger.warn("ipfs", `Gateway fetch failed for ${ref}`, err);
    return null;
  }
}
