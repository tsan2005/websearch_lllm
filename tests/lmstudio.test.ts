import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LMStudioClient } from '../src/lmstudio.js';
import { DeepSearchResult } from '../src/types.js';

const { mockModelsList, mockCompletionsCreate } = vi.hoisted(() => ({
  mockModelsList: vi.fn(),
  mockCompletionsCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class {
    models = { list: mockModelsList };
    chat = { completions: { create: mockCompletionsCreate } };
  },
}));

function makeDeepResult(): DeepSearchResult {
  return {
    query: 'test query',
    searchResults: [
      { title: 'Source One', url: 'https://one.com', snippet: 'snippet 1' },
      { title: 'Source Two', url: 'https://two.com', snippet: 'snippet 2' },
    ],
    pages: [
      { url: 'https://one.com', title: 'Source One', content: 'Content from source one.', wordCount: 4 },
      { url: 'https://two.com', title: 'Source Two', content: '', wordCount: 0, error: 'timeout' },
    ],
    fetchedCount: 1,
    failedCount: 1,
    totalWordCount: 4,
  };
}

describe('LMStudioClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isAvailable', () => {
    it('returns true when model list succeeds', async () => {
      mockModelsList.mockResolvedValue({ data: [] });
      const client = new LMStudioClient();
      expect(await client.isAvailable()).toBe(true);
    });

    it('returns false (does not throw) when model list fails', async () => {
      mockModelsList.mockRejectedValue(new Error('ECONNREFUSED'));
      const client = new LMStudioClient();
      expect(await client.isAvailable()).toBe(false);
    });
  });

  describe('synthesize', () => {
    it('returns a SynthesisResult with answer, model, and tokenUsage', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'Synthesized answer [1].' } }],
        model: 'test-model',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const client = new LMStudioClient();
      const result = await client.synthesize('test query', makeDeepResult());

      expect(result.answer).toBe('Synthesized answer [1].');
      expect(result.model).toBe('test-model');
      expect(result.tokenUsage).toMatchObject({ prompt: 100, completion: 50, total: 150 });
    });

    it('includes the query and source URLs in the prompt', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'answer' } }],
        model: 'local-model',
        usage: null,
      });

      const client = new LMStudioClient();
      await client.synthesize('test query', makeDeepResult());

      const callArgs = mockCompletionsCreate.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string;

      expect(userMessage).toContain('test query');
      expect(userMessage).toContain('https://one.com');
      expect(userMessage).toContain('https://two.com');
      expect(userMessage).toContain('Content from source one.');
    });

    it('marks failed pages as fetch failed in the prompt', async () => {
      mockCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'answer' } }],
        model: 'local-model',
        usage: null,
      });

      const client = new LMStudioClient();
      await client.synthesize('test query', makeDeepResult());

      const callArgs = mockCompletionsCreate.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string;
      expect(userMessage).toContain('(fetch failed)');
    });
  });

  describe('constructor', () => {
    it('reads LMSTUDIO_MODEL from env', () => {
      process.env.LMSTUDIO_MODEL = 'my-custom-model';
      const client = new LMStudioClient();
      expect((client as unknown as { config: { model: string } }).config.model).toBe('my-custom-model');
    });

    it('defaults to local-model when LMSTUDIO_MODEL is not set', () => {
      delete process.env.LMSTUDIO_MODEL;
      const client = new LMStudioClient();
      expect((client as unknown as { config: { model: string } }).config.model).toBe('local-model');
    });
  });
});
