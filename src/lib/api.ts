import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError, type ZodTypeAny, type z } from 'zod';

/**
 * Shared API conventions
 *   success: the resource itself, or { items, total, page, pageSize } for lists
 *   error:   { error: string, code?: string, details?: unknown }
 */

/** Throw inside a route or service to return a specific status. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown) =>
  new ApiError(400, message, code, details);
export const forbidden = (message = 'Forbidden', code = 'FORBIDDEN') => new ApiError(403, message, code);
export const notFound = (message = 'Not found') => new ApiError(404, message, 'NOT_FOUND');
export const conflict = (message: string, code = 'CONFLICT') => new ApiError(409, message, code);

export function errorResponse(status: number, error: string, code?: string, details?: unknown) {
  return NextResponse.json({ error, ...(code && { code }), ...(details !== undefined && { details }) }, { status });
}

/** Maps thrown errors to safe responses; unexpected errors are logged and returned as a generic 500. */
export function toErrorResponse(error: unknown, context: string) {
  if (error instanceof ApiError) {
    return errorResponse(error.status, error.message, error.code, error.details);
  }
  if (error instanceof ZodError) {
    return errorResponse(400, 'Validation failed', 'VALIDATION_FAILED', error.flatten());
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return errorResponse(409, 'This record already exists', 'DUPLICATE');
    if (error.code === 'P2025') return errorResponse(404, 'Not found', 'NOT_FOUND');
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.error(`[${context}] database unavailable:`, error.message);
    return errorResponse(503, 'The database is temporarily unavailable. Please try again shortly.', 'DB_UNAVAILABLE');
  }
  console.error(`[${context}]`, error);
  return errorResponse(500, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
}

type RouteContext<P> = { params: Promise<P> };

/** Wraps a route handler so thrown ApiErrors/ZodErrors become JSON responses. */
export function route<P = Record<string, string>>(
  context: string,
  handler: (request: NextRequest, params: P) => Promise<Response>
) {
  return async (request: NextRequest, ctx: RouteContext<P>) => {
    try {
      return await handler(request, ((await ctx?.params) ?? {}) as P);
    } catch (error) {
      return toErrorResponse(error, context);
    }
  };
}

/** Parses and validates a JSON body; throws ApiError(400) on malformed JSON or invalid data. */
export async function parseBody<S extends ZodTypeAny>(request: NextRequest, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest('Invalid JSON body', 'INVALID_JSON');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badRequest('Validation failed', 'VALIDATION_FAILED', parsed.error.flatten());
  return parsed.data;
}

/** Validates query-string parameters against a schema. */
export function parseQuery<S extends ZodTypeAny>(request: NextRequest, schema: S): z.infer<S> {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw badRequest('Invalid query parameters', 'VALIDATION_FAILED', parsed.error.flatten());
  return parsed.data;
}

export const MAX_PAGE_SIZE = 50;

export function paginate(page: number, pageSize: number) {
  const size = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  return { skip: (Math.max(page, 1) - 1) * size, take: size, page: Math.max(page, 1), pageSize: size };
}

export function listResponse<T>(items: T[], total: number, page: number, pageSize: number) {
  return NextResponse.json({ items, total, page, pageSize });
}

/** Best-effort client IP for rate limiting and audit logs (set by the Next.js server). */
/**
 * The client's IP, used as a rate-limit key. X-Forwarded-For is a list that a client can pre-fill with
 * anything, so the leftmost entry cannot be trusted; each proxy appends the address it received the
 * request from. With TRUSTED_PROXY_HOPS proxies in front of the app (default 1: Vercel, Render), the
 * real client address is that many entries from the right. TRUSTED_PROXY_HOPS=0 means the app is
 * reached directly, so forwarding headers are ignored.
 *
 * CLIENT_IP_HEADER names a header that the hosting platform itself sets to the client address and
 * clients cannot override – on Netlify "x-nf-client-connection-ip". Set it only for such a platform.
 */
export function clientIp(request: Request): string {
  const platformHeader = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (platformHeader) {
    const value = request.headers.get(platformHeader)?.split(',')[0]?.trim();
    if (value) return value;
  }
  const parsed = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '', 10);
  const hops = Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 10) : 1;
  if (hops === 0) return 'unknown';
  const chain = (request.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (chain.length > 0) return chain[Math.max(0, chain.length - hops)];
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
