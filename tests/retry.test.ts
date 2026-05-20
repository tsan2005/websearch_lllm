import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import { withRetry, isRetryableAxiosError } from '../src/retry.js';

vi.mock('../src/utils.js', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
  sanitizeQuery: (q: string) => q.trim().substring(0, 1000),
  cleanText: (t: string, max = 10000) => t.trim().substring(0, max),
  getWordCount: (t: string) => t.trim().split(/\s+/).filter(Boolean).length,
  validateUrl: (u: string) => { try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; } catch { return false; } },
}));

describe('withRetry', () => {
  it('resolves immediately on first success with no retries', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts all attempts and re-throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('stops retrying when shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not retryable'));
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 0, shouldRetry: () => false })
    ).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('isRetryableAxiosError', () => {
  function makeAxiosError(status?: number) {
    const err = new axios.AxiosError('test');
    if (status !== undefined) {
      err.response = { status } as never;
    }
    return err;
  }

  it('returns true for 429', () => {
    expect(isRetryableAxiosError(makeAxiosError(429))).toBe(true);
  });

  it('returns true for 500', () => {
    expect(isRetryableAxiosError(makeAxiosError(500))).toBe(true);
  });

  it('returns true for 502', () => {
    expect(isRetryableAxiosError(makeAxiosError(502))).toBe(true);
  });

  it('returns true for 503', () => {
    expect(isRetryableAxiosError(makeAxiosError(503))).toBe(true);
  });

  it('returns true for 504', () => {
    expect(isRetryableAxiosError(makeAxiosError(504))).toBe(true);
  });

  it('returns true for network error (no response)', () => {
    expect(isRetryableAxiosError(makeAxiosError())).toBe(true);
  });

  it('returns false for 400', () => {
    expect(isRetryableAxiosError(makeAxiosError(400))).toBe(false);
  });

  it('returns false for 401', () => {
    expect(isRetryableAxiosError(makeAxiosError(401))).toBe(false);
  });

  it('returns false for 403', () => {
    expect(isRetryableAxiosError(makeAxiosError(403))).toBe(false);
  });

  it('returns false for 404', () => {
    expect(isRetryableAxiosError(makeAxiosError(404))).toBe(false);
  });

  it('returns false for non-Axios errors', () => {
    expect(isRetryableAxiosError(new Error('generic'))).toBe(false);
    expect(isRetryableAxiosError('string error')).toBe(false);
    expect(isRetryableAxiosError(null)).toBe(false);
  });
});
