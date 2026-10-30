import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { verifyMessage } from "ethers";
import { env } from "../config/env.js";
import { chainConfig } from "../config/chain.js";
import { AuthNonce } from "../models/AuthNonce.js";
import { User } from "../models/User.js";
import { badRequest, conflict, notFound, unauthorized } from "../utils/errors.js";
import { normalizeAddress } from "../utils/chain.js";

const NONCE_TTL_MS = 10 * 60 * 1000;

export interface JwtPayload {
  sub: string; // user id
  address: string;
}

export function buildSignInMessage(address: string, nonce: string, issuedAt: string) {
  return [
    "TrustChain wants you to sign in with your Ethereum account:",
    address,
    "",
    "Signing proves you own this wallet. It does not send a transaction or cost gas.",
    "",
    `Chain ID: ${chainConfig.chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function createNonce(rawAddress: string) {
  const address = normalizeAddress(rawAddress);
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const message = buildSignInMessage(address, nonce, issuedAt);
  await AuthNonce.create({ address, nonce, message, expiresAt: new Date(Date.now() + NONCE_TTL_MS) });
  return { nonce, message };
}

/**
 * Verify that `signature` is the wallet's signature of the most recent unused nonce message.
 * The nonce is consumed atomically so a signature can never be replayed.
 */
export async function consumeSignature(rawAddress: string, signature: string): Promise<string> {
  const address = normalizeAddress(rawAddress);
  const record = await AuthNonce.findOneAndUpdate(
    { address, used: false, expiresAt: { $gt: new Date() } },
    { $set: { used: true } },
    { sort: { expiresAt: -1 }, new: false },
  );
  if (!record) throw unauthorized("Sign-in request expired or not found. Request a new nonce.");

  let recovered: string;
  try {
    recovered = verifyMessage(record.message, signature);
  } catch {
    throw badRequest("Malformed signature");
  }
  if (recovered.toLowerCase() !== address) throw unauthorized("Signature does not match the wallet address");
  return address;
}

export function issueToken(userId: string, address: string) {
  const payload: JwtPayload = { sub: userId, address };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw unauthorized("Session expired or invalid. Please sign in again.");
  }
}

export async function register(input: {
  address: string;
  signature: string;
  name: string;
  email?: string;
  organization?: string;
  requestedRole: "DONOR" | "NGO" | "VERIFIER";
}) {
  const address = normalizeAddress(input.address);
  if (await User.exists({ address })) throw conflict("An account already exists for this wallet. Please sign in.");
  await consumeSignature(address, input.signature);
  const user = await User.create({
    address,
    name: input.name,
    email: input.email,
    organization: input.organization,
    requestedRole: input.requestedRole,
    lastLoginAt: new Date(),
  });
  return { user, token: issueToken(String(user._id), address) };
}

export async function login(rawAddress: string, signature: string) {
  const address = normalizeAddress(rawAddress);
  const user = await User.findOne({ address });
  if (!user) throw notFound("No account for this wallet. Please register first.");
  await consumeSignature(address, signature);
  user.lastLoginAt = new Date();
  await user.save();
  return { user, token: issueToken(String(user._id), address) };
}
