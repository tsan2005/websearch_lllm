export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  age?: string;
}

export interface FetchedPage {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  error?: string;
}

export interface DeepSearchResult {
  query: string;
  searchResults: SearchResult[];
  pages: FetchedPage[];
  fetchedCount: number;
  failedCount: number;
  totalWordCount: number;
}

export interface SynthesisResult {
  answer: string;
  model: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}
