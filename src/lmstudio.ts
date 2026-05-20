import OpenAI from 'openai';
import { DeepSearchResult, SynthesisResult } from './types.js';

export interface LMStudioConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export class LMStudioClient {
  private readonly client: OpenAI;
  private readonly config: LMStudioConfig;

  constructor(config?: Partial<LMStudioConfig>) {
    const baseUrl =
      config?.baseUrl ??
      process.env.LMSTUDIO_BASE_URL ??
      'http://localhost:1234/v1';
    const model =
      config?.model ?? process.env.LMSTUDIO_MODEL ?? 'local-model';
    const timeoutMs = config?.timeoutMs ?? 30000;

    this.config = { baseUrl, model, timeoutMs };
    this.client = new OpenAI({
      baseURL: baseUrl,
      apiKey: 'lmstudio',
      timeout: timeoutMs,
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async synthesize(
    query: string,
    deepResult: DeepSearchResult
  ): Promise<SynthesisResult> {
    const sourcesHeader = deepResult.searchResults
      .map((r, i) => `[${i + 1}] ${r.title} - ${r.url}`)
      .join('\n');

    const contentBlocks = deepResult.pages.map((page, i) => {
      const label = `[${i + 1}] ${page.title}`;
      if (page.error || !page.content) {
        return `${label}\n(fetch failed)`;
      }
      return `${label}\n${page.content.substring(0, 3000)}`;
    });

    const userPrompt =
      `Query: ${query}\n\n` +
      `Sources:\n${sourcesHeader}\n\n` +
      `Content from sources:\n${contentBlocks.join('\n\n---\n\n')}\n\n` +
      `Please provide a comprehensive answer to the query, citing specific sources using [1], [2], etc.`;

    const completion = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a research assistant. You are given search results and page content from multiple web sources. ' +
            'Synthesize the information into a comprehensive, accurate answer. ' +
            'Cite your sources using [1], [2], etc. corresponding to the source list provided.',
        },
        { role: 'user', content: userPrompt },
      ],
    });

    const answer = completion.choices[0]?.message?.content ?? '';
    const usage = completion.usage;

    return {
      answer,
      model: completion.model ?? this.config.model,
      tokenUsage: usage
        ? {
            prompt: usage.prompt_tokens,
            completion: usage.completion_tokens,
            total: usage.total_tokens,
          }
        : undefined,
    };
  }
}
