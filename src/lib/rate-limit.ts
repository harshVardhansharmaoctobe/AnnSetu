/**
 * Fixed-window in-memory rate limiter.
 *
 * Suitable for the single-process `next start` used in this MVP. With several server
 * instances each process counts separately; move the store to Redis/Postgres before scaling out.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }) {
  const buckets = new Map<string, Bucket>();
  const now = options.now ?? Date.now;

  function current(key: string): Bucket {
    const t = now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      bucket = { count: 0, resetAt: t + options.windowMs };
      buckets.set(key, bucket);
    }
    // Opportunistic cleanup so the map cannot grow without bound.
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
    }
    return bucket;
  }

  function result(bucket: Bucket): RateLimitResult {
    return {
      allowed: bucket.count < options.limit,
      remaining: Math.max(0, options.limit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now()) / 1000)),
    };
  }

  return {
    /** Counts one hit and reports whether it was within the limit. */
    hit(key: string): RateLimitResult {
      const bucket = current(key);
      const allowedBefore = bucket.count < options.limit;
      bucket.count += 1;
      return { ...result(bucket), allowed: allowedBefore };
    },
    /** Reports the state without counting a hit. */
    check(key: string): RateLimitResult {
      return result(current(key));
    },
    reset(key: string) {
      buckets.delete(key);
    },
  };
}

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const globalLimiters = globalThis as unknown as {
  foodbridgeLimiters?: {
    loginFailures: ReturnType<typeof createRateLimiter>;
    registration: ReturnType<typeof createRateLimiter>;
    uploads: ReturnType<typeof createRateLimiter>;
    passwordReset: ReturnType<typeof createRateLimiter>;
    geocoding: ReturnType<typeof createRateLimiter>;
  };
};

// Kept on globalThis so dev-mode hot reloads do not reset counters.
export const limiters = (globalLimiters.foodbridgeLimiters ??= {
  // Failed sign-ins per email: locks the account for the window after too many wrong passwords.
  loginFailures: createRateLimiter({ limit: envInt('LOGIN_MAX_FAILURES', 5), windowMs: 15 * 60_000 }),
  // Registrations per client IP.
  registration: createRateLimiter({ limit: envInt('REGISTER_RATE_LIMIT', 10), windowMs: 60 * 60_000 }),
  // Uploads per user.
  uploads: createRateLimiter({ limit: envInt('UPLOAD_RATE_LIMIT', 60), windowMs: 60 * 60_000 }),
  // Forgot-password requests per client IP and per email.
  passwordReset: createRateLimiter({ limit: envInt('PASSWORD_RESET_RATE_LIMIT', 5), windowMs: 60 * 60_000 }),
  // Address lookups per client IP (each also waits its turn in the 1 request/second geocoder queue).
  geocoding: createRateLimiter({ limit: envInt('GEOCODE_RATE_LIMIT', 60), windowMs: 10 * 60_000 }),
});
