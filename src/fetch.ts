import axios from 'axios';
import * as cheerio from 'cheerio';
import { cleanText } from './utils.js';
import { withRetry, isRetryableAxiosError } from './retry.js';

const HEADERS = [
  {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130"',
    'sec-ch-ua-platform': '"Windows"',
  },
  {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130"',
    'sec-ch-ua-platform': '"macOS"',
  },
  {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130"',
    'sec-ch-ua-platform': '"Linux"',
  },
];

function randomHeaders(): Record<string, string> {
  const base = HEADERS[Math.floor(Math.random() * HEADERS.length)];
  return {
    ...base,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'sec-ch-ua-mobile': '?0',
  };
}

export function parseHtml(html: string): string {
  const $ = cheerio.load(html);

  $('script, style, noscript, iframe, img, video, audio, canvas, svg, object, embed, form, input, textarea, select, button').remove();
  $('nav, header, footer, aside, .nav, .header, .footer, .sidebar, .menu, .ad, .advertisement, .ads, .social-share, .comments, .newsletter, .cookie-notice, .popup, .modal, .toolbar, .banner, .sponsored').remove();
  $('[class*="ad-"], [class*="advertisement"], [class*="banner"], [class*="popup"], [class*="sponsored"]').remove();

  const contentSelectors = [
    'article', 'main', '[role="main"]',
    '.content', '.post-content', '.entry-content',
    '.article-content', '.main-content', '.page-content',
    '.body-content', '.text-content',
  ];

  for (const selector of contentSelectors) {
    const text = $(selector).first().text().trim();
    if (text.length > 100) return text;
  }

  return $('body').text().trim();
}

export async function fetchPage(url: string, timeout = 8000): Promise<string> {
  const response = await withRetry(
    () => axios.get<string>(url, {
      headers: randomHeaders(),
      timeout,
      responseType: 'text',
    }),
    { maxAttempts: 2, baseDelayMs: 300, shouldRetry: isRetryableAxiosError }
  );

  const raw = parseHtml(response.data);
  return cleanText(raw, 50000);
}
