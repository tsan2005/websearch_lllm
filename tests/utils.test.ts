import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cleanText,
  getWordCount,
  validateUrl,
  sanitizeQuery,
  delay,
} from '../src/utils.js';

describe('cleanText', () => {
  it('collapses multiple newlines to a single newline', () => {
    expect(cleanText('foo\n\n  bar')).toBe('foo\nbar');
  });

  it('collapses runs of spaces to a single space', () => {
    expect(cleanText('foo   bar')).toBe('foo bar');
  });

  it('preserves single newlines', () => {
    expect(cleanText('line one\nline two')).toBe('line one\nline two');
  });

  it('trims leading and trailing whitespace', () => {
    expect(cleanText('  hello  ')).toBe('hello');
  });

  it('truncates to maxLength', () => {
    const long = 'a'.repeat(200);
    expect(cleanText(long, 100)).toHaveLength(100);
  });

  it('does not truncate when text is shorter than maxLength', () => {
    expect(cleanText('short', 100)).toBe('short');
  });
});

describe('getWordCount', () => {
  it('counts words correctly', () => {
    expect(getWordCount('hello world foo')).toBe(3);
  });

  it('returns 0 for an empty string', () => {
    expect(getWordCount('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', () => {
    expect(getWordCount('   ')).toBe(0);
  });

  it('handles multiple spaces between words', () => {
    expect(getWordCount('a  b  c')).toBe(3);
  });
});

describe('validateUrl', () => {
  it('accepts http URLs', () => {
    expect(validateUrl('http://example.com')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(validateUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects ftp URLs', () => {
    expect(validateUrl('ftp://example.com')).toBe(false);
  });

  it('rejects bare hostnames', () => {
    expect(validateUrl('example.com')).toBe(false);
  });

  it('rejects malformed strings', () => {
    expect(validateUrl('not a url')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateUrl('')).toBe(false);
  });
});

describe('sanitizeQuery', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeQuery('  hello  ')).toBe('hello');
  });

  it('truncates to 1000 characters', () => {
    const long = 'a'.repeat(2000);
    expect(sanitizeQuery(long)).toHaveLength(1000);
  });

  it('returns empty string unchanged', () => {
    expect(sanitizeQuery('')).toBe('');
  });
});

describe('delay', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('resolves after the specified milliseconds', async () => {
    const promise = delay(100);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
  });
});
