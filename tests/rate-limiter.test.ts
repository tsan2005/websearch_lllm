import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('allows up to maxRequestsPerMinute calls', async () => {
    const limiter = new RateLimiter(3);
    const fn = vi.fn().mockResolvedValue('ok');
    await limiter.execute(fn);
    await limiter.execute(fn);
    await limiter.execute(fn);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws "Rate limit exceeded" on the call that exceeds the limit', async () => {
    const limiter = new RateLimiter(2);
    const fn = vi.fn().mockResolvedValue('ok');
    await limiter.execute(fn);
    await limiter.execute(fn);
    await expect(limiter.execute(fn)).rejects.toThrow('Rate limit exceeded');
  });

  it('resets the counter after the minute window', async () => {
    const limiter = new RateLimiter(1);
    const fn = vi.fn().mockResolvedValue('ok');
    await limiter.execute(fn);
    await expect(limiter.execute(fn)).rejects.toThrow('Rate limit exceeded');

    vi.advanceTimersByTime(60001);

    await expect(limiter.execute(fn)).resolves.toBe('ok');
  });

  it('race condition: 3 simultaneous calls against limit of 2 — exactly one rejects', async () => {
    vi.useRealTimers();
    const limiter = new RateLimiter(2);
    const fn = () => Promise.resolve('ok');

    const results = await Promise.allSettled([
      limiter.execute(fn),
      limiter.execute(fn),
      limiter.execute(fn),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch('Rate limit exceeded');
  });
});
