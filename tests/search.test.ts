import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('axios');
vi.mock('../src/retry.js', () => ({
  withRetry: (fn: () => unknown) => fn(),
  isRetryableAxiosError: () => false,
}));
vi.mock('../src/utils.js', () => ({
  sanitizeQuery: vi.fn((q: string) => q.trim().substring(0, 1000)),
  delay: vi.fn().mockResolvedValue(undefined),
  cleanText: (t: string, max = 10000) => t.trim().substring(0, max),
  getWordCount: (t: string) => t.trim().split(/\s+/).filter(Boolean).length,
  validateUrl: () => true,
}));

import axios from 'axios';
import { BraveSearch } from '../src/search.js';
import { sanitizeQuery } from '../src/utils.js';

const mockedAxios = vi.mocked(axios);

describe('BraveSearch', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, BRAVE_API_KEY: 'test-key' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws if BRAVE_API_KEY is not set', () => {
    delete process.env.BRAVE_API_KEY;
    expect(() => new BraveSearch()).toThrow('BRAVE_API_KEY');
  });

  it('maps Brave API response to SearchResult[]', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        web: {
          results: [
            { title: 'Test Title', url: 'https://example.com', description: 'A snippet', page_age: '1 day ago' },
          ],
        },
      },
    });

    const searcher = new BraveSearch();
    const results = await searcher.search('test query');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: 'Test Title',
      url: 'https://example.com',
      snippet: 'A snippet',
      age: '1 day ago',
    });
  });

  it('returns empty array when web.results is absent', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: {} });
    const searcher = new BraveSearch();
    const results = await searcher.search('test');
    expect(results).toEqual([]);
  });

  it('calls sanitizeQuery with the raw input', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: { web: { results: [] } } });
    const searcher = new BraveSearch();
    await searcher.search('  raw query  ');
    expect(sanitizeQuery).toHaveBeenCalledWith('  raw query  ');
  });

  it('clamps numResults to 20 in the API params', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: { web: { results: [] } } });
    const searcher = new BraveSearch();
    await searcher.search('query', 50);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ params: expect.objectContaining({ count: 20 }) })
    );
  });

  it('uses empty string for snippet when description is absent', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: {
        web: {
          results: [{ title: 'T', url: 'https://x.com' }],
        },
      },
    });
    const searcher = new BraveSearch();
    const results = await searcher.search('q');
    expect(results[0].snippet).toBe('');
  });
});
