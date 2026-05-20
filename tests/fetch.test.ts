import { describe, it, expect, vi } from 'vitest';

vi.mock('axios');
vi.mock('../src/retry.js', () => ({
  withRetry: (fn: () => unknown) => fn(),
  isRetryableAxiosError: () => false,
}));
vi.mock('../src/utils.js', () => ({
  cleanText: (t: string, max = 10000) => t.replace(/\n\s*\n/g, '\n').replace(/[^\S\n]+/g, ' ').trim().substring(0, max),
  delay: vi.fn().mockResolvedValue(undefined),
  sanitizeQuery: (q: string) => q.trim(),
  getWordCount: (t: string) => t.trim().split(/\s+/).filter(Boolean).length,
  validateUrl: () => true,
}));

import axios from 'axios';
import { fetchPage, parseHtml } from '../src/fetch.js';

const mockedAxios = vi.mocked(axios);

describe('fetchPage', () => {
  it('returns cleaned text from a mocked HTML response', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: '<html><body><article>Hello World</article></body></html>',
    });
    const result = await fetchPage('https://example.com');
    expect(result).toContain('Hello World');
  });

  it('strips <script> tags from the output', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: '<html><body><article>Content</article><script>evil()</script></body></html>',
    });
    const result = await fetchPage('https://example.com');
    expect(result).not.toContain('evil()');
  });

  it('strips <nav> tags from the output', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: '<html><body><nav>Menu</nav><article>Real Content</article></body></html>',
    });
    const result = await fetchPage('https://example.com');
    expect(result).not.toContain('Menu');
    expect(result).toContain('Real Content');
  });

  it('prefers <article> content over <body> text', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: '<html><body><p>Body only</p><article>Article content that is definitely longer than one hundred characters to pass the threshold check in parseHtml</article></body></html>',
    });
    const result = await fetchPage('https://example.com');
    expect(result).toContain('Article content');
  });

  it('does NOT pass validateStatus to axios', async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({ data: '<html><body>ok</body></html>' });
    await fetchPage('https://example.com');
    const callArgs = (mockedAxios.get as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs).not.toHaveProperty('validateStatus');
  });
});

describe('parseHtml', () => {
  it('falls back to body text when no content selector matches', () => {
    const html = '<html><body><p>Fallback text here</p></body></html>';
    const result = parseHtml(html);
    expect(result).toContain('Fallback text here');
  });

  it('prefers <main> when article is absent', () => {
    const longText = 'Main content '.repeat(20);
    const html = `<html><body><main>${longText}</main></body></html>`;
    const result = parseHtml(html);
    expect(result).toContain('Main content');
  });
});
