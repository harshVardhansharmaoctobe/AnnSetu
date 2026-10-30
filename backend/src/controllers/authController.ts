import type { Request, Response } from "express";
import * as authService from "../services/authService.js";
import { getRoles } from "../services/roleService.js";
import { loginSchema, nonceSchema, profileSchema, registerSchema } from "../validators/schemas.js";

function publicUser(u: { _id: unknown; address: string; name: string; email?: string | null; organization?: string | null; requestedRole?: string | null; isDemo?: boolean | null; createdAt?: Date }) {
  return {
    id: String(u._id),
    address: u.address,
    name: u.name,
    email: u.email ?? null,
    organization: u.organization ?? null,
    requestedRole: u.requestedRole ?? "DONOR",
    isDemo: !!u.isDemo,
    createdAt: u.createdAt,
  };
}

async function rolesOrNull(address: string) {
  try {
    return { roles: await getRoles(address), chainAvailable: true };
  } catch {
    return { roles: null, chainAvailable: false };
  }
}

export async function nonce(req: Request, res: Response) {
  const { address } = nonceSchema.parse(req.body);
  res.json(await authService.createNonce(address));
}

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const { user, token } = await authService.register(input);
  res.status(201).json({ token, user: publicUser(user), ...(await rolesOrNull(user.address)) });
}

export async function login(req: Request, res: Response) {
  const { address, signature } = loginSchema.parse(req.body);
  const { user, token } = await authService.login(address, signature);
  res.json({ token, user: publicUser(user), ...(await rolesOrNull(user.address)) });
}

export async function me(req: Request, res: Response) {
  const user = req.auth!.user;
  res.json({ user: publicUser(user), ...(await rolesOrNull(user.address)) });
}

export async function updateMe(req: Request, res: Response) {
  const input = profileSchema.parse(req.body);
  const user = req.auth!.user;
  if (input.name !== undefined) user.name = input.name;
  if (input.email !== undefined) user.email = input.email || undefined;
  if (input.organization !== undefined) user.organization = input.organization;
  await user.save();
  res.json({ user: publicUser(user) });
}

export { publicUser };
