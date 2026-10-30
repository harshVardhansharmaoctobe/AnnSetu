import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  it('allows hits up to the limit, then blocks', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect([1, 2, 3].map(() => limiter.hit('a').allowed)).toEqual([true, true, true]);
    expect(limiter.hit('a').allowed).toBe(false);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('counts keys independently', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.hit('a').allowed).toBe(true);
    expect(limiter.hit('b').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(false);
  });

  it('resets after the window and on reset()', () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    limiter.hit('a');
    expect(limiter.check('a').allowed).toBe(false);
    t = 1001;
    expect(limiter.check('a').allowed).toBe(true);
    limiter.hit('a');
    limiter.reset('a');
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('reports a positive retry-after while blocked', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    limiter.hit('a');
    const r = limiter.hit('a');
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBe(60);
    expect(r.remaining).toBe(0);
  });
});
