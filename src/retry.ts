import axios from 'axios';
import { delay } from './utils.js';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  shouldRetry?: (error: unknown) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 10000,
    factor = 2,
    shouldRetry = () => true,
  } = options;

  if (maxAttempts < 1) throw new Error('maxAttempts must be at least 1');

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      const base = Math.min(baseDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);
      const jitter = base * (0.9 + Math.random() * 0.2);
      await delay(Math.round(jitter));
    }
  }
  throw lastError;
}

export function isRetryableAxiosError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true; // network error or timeout
  const status = error.response.status;
  return status === 429 || (status >= 500 && status <= 504);
}
