import type { RequestHandler } from "express";
import { User } from "../models/User.js";
import { verifyToken } from "../services/authService.js";
import { getRoles, type Role, type RoleSet } from "../services/roleService.js";
import { forbidden, unauthorized } from "../utils/errors.js";

export interface AuthContext {
  userId: string;
  address: string;
  user: InstanceType<typeof User>;
  roles?: RoleSet;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function bearer(header?: string) {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = bearer(req.headers.authorization);
  if (!token) throw unauthorized();
  const payload = verifyToken(token);
  const user = await User.findById(payload.sub);
  if (!user || user.address !== payload.address) throw unauthorized("Account no longer exists");
  req.auth = { userId: String(user._id), address: user.address, user };
  next();
};

/**
 * Require an on-chain role. Roles are read from the TrustChain contract on every check (short
 * cache), so a revoked NGO/verifier loses API access as soon as the revocation is mined.
 */
export const requireRole =
  (...allowed: Exclude<Role, "DONOR">[]): RequestHandler =>
  async (req, _res, next) => {
    if (!req.auth) throw unauthorized();
    const roles = await getRoles(req.auth.address);
    req.auth.roles = roles;
    const ok = allowed.some((r) => (r === "ADMIN" ? roles.isAdmin : r === "NGO" ? roles.isNGO : roles.isVerifier));
    if (!ok) throw forbidden(`This action requires the ${allowed.join(" or ")} role on-chain`);
    next();
  };
