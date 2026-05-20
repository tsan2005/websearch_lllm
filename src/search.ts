import axios from 'axios';
import { SearchResult } from './types.js';
import { sanitizeQuery } from './utils.js';
import { withRetry, isRetryableAxiosError } from './retry.js';

interface BraveWebResult {
  title: string;
  url: string;
  description?: string;
  page_age?: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

export class BraveSearch {
  private readonly apiKey: string;
  private readonly endpoint = 'https://api.search.brave.com/res/v1/web/search';

  constructor() {
    const key = process.env.BRAVE_API_KEY;
    if (!key) {
      throw new Error(
        'BRAVE_API_KEY environment variable is required. Get a free key at https://brave.com/search/api/'
      );
    }
    this.apiKey = key;
  }

  async search(query: string, numResults: number = 5): Promise<SearchResult[]> {
    const safeQuery = sanitizeQuery(query);
    const response = await withRetry(
      () => axios.get<BraveSearchResponse>(this.endpoint, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
        params: {
          q: safeQuery,
          count: Math.min(numResults, 20),
        },
        timeout: 10000,
      }),
      { maxAttempts: 3, baseDelayMs: 500, shouldRetry: isRetryableAxiosError }
    );

    const results = response.data.web?.results ?? [];
    return results.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description ?? '',
      age: r.page_age,
    }));
  }
}
