import { getContract } from "../config/chain.js";
import { unavailable } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export type Role = "ADMIN" | "NGO" | "VERIFIER" | "DONOR";

export interface RoleSet {
  isAdmin: boolean;
  isNGO: boolean;
  isVerifier: boolean;
  roles: Role[];
}

const CACHE_MS = 10_000;
const cache = new Map<string, { value: RoleSet; at: number }>();

/** Roles are read from the TrustChain contract — the chain, not MongoDB, decides who is privileged. */
export async function getRoles(address: string): Promise<RoleSet> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  let isAdmin: boolean, isNGO: boolean, isVerifier: boolean;
  try {
    const contract = getContract();
    [isAdmin, isNGO, isVerifier] = await Promise.all([
      contract.isAdmin(key) as Promise<boolean>,
      contract.isNGO(key) as Promise<boolean>,
      contract.isVerifier(key) as Promise<boolean>,
    ]);
  } catch (err) {
    logger.warn("roles", `Could not read roles for ${key}`, err);
    throw unavailable("Blockchain is unavailable — cannot verify on-chain roles right now");
  }

  const roles: Role[] = ["DONOR"];
  if (isAdmin) roles.push("ADMIN");
  if (isNGO) roles.push("NGO");
  if (isVerifier) roles.push("VERIFIER");
  const value = { isAdmin, isNGO, isVerifier, roles };
  cache.set(key, { value, at: Date.now() });
  return value;
}

export function invalidateRoles(address?: string) {
  if (address) cache.delete(address.toLowerCase());
  else cache.clear();
}
