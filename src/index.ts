#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import pLimit from 'p-limit';
import { BraveSearch } from './search.js';
import { fetchPage } from './fetch.js';
import { getWordCount, validateUrl } from './utils.js';
import { RateLimiter } from './rate-limiter.js';
import { LMStudioClient } from './lmstudio.js';
import { DeepSearchResult, FetchedPage } from './types.js';

const server = new McpServer({
  name: 'mcpllmws',
  version: '0.1.0',
});

const brave = new BraveSearch();
const rateLimiter = new RateLimiter(10);
const lmstudio = new LMStudioClient();

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(n), min), max);
}

async function runDeepSearch(
  query: string,
  numResults: number
): Promise<DeepSearchResult> {
  const searchResults = await rateLimiter.execute(() =>
    brave.search(query, numResults)
  );

  const limit = pLimit(3);
  const settled = await Promise.allSettled(
    searchResults.map(result =>
      limit(async () => {
        try {
          const content = await fetchPage(result.url);
          return {
            url: result.url,
            title: result.title,
            content,
            wordCount: getWordCount(content),
          } satisfies FetchedPage;
        } catch (e) {
          return {
            url: result.url,
            title: result.title,
            content: '',
            wordCount: 0,
            error: String(e),
          } satisfies FetchedPage;
        }
      })
    )
  );

  const pages: FetchedPage[] = settled.map(r =>
    r.status === 'fulfilled' ? r.value : {
      url: '',
      title: '',
      content: '',
      wordCount: 0,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    }
  );

  const fetchedCount = pages.filter(p => !p.error).length;
  const failedCount = pages.filter(p => !!p.error).length;
  const totalWordCount = pages.reduce((sum, p) => sum + p.wordCount, 0);

  return { query, searchResults, pages, fetchedCount, failedCount, totalWordCount };
}

server.registerTool(
  'web_search',
  {
    description: 'Search the web and return titles, URLs, and snippets. Call fetch_page on promising URLs to read full content.',
    inputSchema: {
      query: z.string().describe('Search query'),
      num_results: z.number().optional().describe('Number of results (1-10, default 5)'),
    },
  },
  async ({ query, num_results }) => {
    const count = clamp(num_results ?? 5, 1, 10);
    const results = await rateLimiter.execute(() => brave.search(query, count));
    const text = results.length === 0
      ? 'No results found.'
      : results
          .map((r, i) =>
            `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}${r.age ? `\nPublished: ${r.age}` : ''}`
          )
          .join('\n\n');
    return { content: [{ type: 'text' as const, text }] };
  }
);

server.registerTool(
  'fetch_page',
  {
    description: 'Fetch and extract the main text content from a URL. Use after web_search to read a page in full.',
    inputSchema: {
      url: z.url().describe('URL to fetch'),
    },
  },
  async ({ url }) => {
    if (!validateUrl(url)) {
      throw new Error(`Invalid URL: ${url}`);
    }
    const text = await rateLimiter.execute(() => fetchPage(url));
    const wordCount = getWordCount(text);
    return { content: [{ type: 'text' as const, text: `Words: ${wordCount}\n\n${text}` }] };
  }
);

server.registerTool(
  'deep_search',
  {
    description: 'Search the web then fetch the top result pages in parallel, returning multi-source content with attribution.',
    inputSchema: {
      query: z.string().describe('Search query'),
      num_results: z.number().optional().describe('Number of pages to search and fetch (1-5, default 3)'),
    },
  },
  async ({ query, num_results }) => {
    const count = clamp(num_results ?? 3, 1, 5);
    const deep = await runDeepSearch(query, count);

    const sourceLines = deep.searchResults
      .map((r, i) => `[${i + 1}] ${r.title} - ${r.url}`)
      .join('\n');

    const contentBlocks = deep.pages.map((page, i) => {
      const label = `[${i + 1}] ${page.title} (${page.wordCount} words)`;
      const body = page.error ? `FETCH FAILED: ${page.error}` : page.content;
      return `${label}\n${body}`;
    }).join('\n\n---\n\n');

    const text =
      `Deep Search: ${query}\n` +
      `Found ${deep.searchResults.length} results, fetched ${deep.fetchedCount} pages` +
      (deep.failedCount > 0 ? ` (${deep.failedCount} failed)` : '') +
      `.\n\nSources:\n${sourceLines}\n\nContent:\n\n${contentBlocks}`;

    return { content: [{ type: 'text' as const, text }] };
  }
);

server.registerTool(
  'smart_search',
  {
    description: 'Search the web, fetch multiple sources in parallel, then synthesize the results using a local LMStudio model with citations. Requires LMStudio running at localhost:1234.',
    inputSchema: {
      query: z.string().describe('Search query'),
      num_results: z.number().optional().describe('Number of sources to fetch (1-5, default 3)'),
    },
  },
  async ({ query, num_results }) => {
    const available = await lmstudio.isAvailable();
    if (!available) {
      return {
        content: [{
          type: 'text' as const,
          text:
            'LMStudio is not available. Please start LMStudio and load a model at http://localhost:1234.\n\n' +
            'The deep_search tool is available as a fallback and returns raw multi-source content without synthesis.',
        }],
      };
    }

    const count = clamp(num_results ?? 3, 1, 5);
    const deep = await runDeepSearch(query, count);
    const synthesis = await lmstudio.synthesize(query, deep);

    const sourceLines = deep.searchResults
      .map((r, i) => `[${i + 1}] ${r.title} - ${r.url}`)
      .join('\n');

    const text =
      `Smart Search: ${query}\n` +
      `Model: ${synthesis.model} | Sources: ${deep.searchResults.length} | Pages fetched: ${deep.fetchedCount}\n\n` +
      `Answer:\n${synthesis.answer}\n\nSources:\n${sourceLines}`;

    return { content: [{ type: 'text' as const, text }] };
  }
);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

const transport = new StdioServerTransport();
await server.connect(transport);
