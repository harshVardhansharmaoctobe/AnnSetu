import { createHash } from "node:crypto";
import { getAddress, isAddress } from "ethers";
import { badRequest } from "./errors.js";

export const MILESTONE_STATUS = ["PENDING", "PENDING_VERIFICATION", "APPROVED", "REJECTED", "RELEASED"] as const;
export type MilestoneStatusName = (typeof MILESTONE_STATUS)[number];
export const MilestoneStatusCode = { Pending: 0, Submitted: 1, Approved: 2, Rejected: 3, Released: 4 } as const;

export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export const sha256Hex = (data: Buffer | Uint8Array | string) => createHash("sha256").update(data).digest("hex");

/** Lower-cased canonical address, or a 400 error. */
export function normalizeAddress(value: string, field = "address"): string {
  if (typeof value !== "string" || !isAddress(value)) throw badRequest(`${field} is not a valid Ethereum address`);
  return getAddress(value).toLowerCase();
}

export const sameAddress = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Recursively convert bigint values (from ethers Result objects) to decimal strings. */
export function serializeBigInts(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeBigInts(v)]));
  }
  return value;
}
