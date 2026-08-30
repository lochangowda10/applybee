import { chatJSON, isAIConfigured, AI_TIMEOUT_MS } from '../ai/provider';
import type { ProductAnalysis } from '../ai/analysis';

/**
 * The two non-repository input types.
 *
 * Most people at a live event will not hand a stranger their private repo, so
 * a deployed URL or a sentence of description has to reach exactly the same
 * pipeline. Both produce a ProductAnalysis indistinguishable in shape from the
 * repository path, so nothing downstream needs to know which was used.
 */

export type InputKind = 'repo' | 'url' | 'description';

/** Decides which of the three inputs the user actually gave us. */
export function classifyInput(raw: string): InputKind {
  const value = raw.trim();
  if (/^(https?:\/\/)?(www\.)?github\.com\/[^/]+\/[^/]+/i.test(value)) return 'repo';
  // A URL is a single token that parses as one; anything with spaces is prose.
  if (!/\s/.test(value) && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value)) {
    return 'url';
  }
  return 'description';
}

/** Normalizes a bare domain into a fetchable URL. */
export function toAbsoluteUrl(value: string): string | null {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Pulls the readable copy out of a page.
 *
 * Deliberately crude: scripts, styles and tags are stripped and the text is
 * capped, because the goal is the product's own positioning language, not a
 * faithful DOM. Meta description and title are kept because they are usually
 * the most concentrated statement of what a product claims to be.
 */
export function extractPageCopy(html: string): string {
  const pick = (re: RegExp) => re.exec(html)?.[1]?.trim() ?? '';
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = pick(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
  );
  const ogDescription = pick(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i
  );

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return [
    title && `TITLE: ${title}`,
    description && `META DESCRIPTION: ${description}`,
    ogDescription && `OG DESCRIPTION: ${ogDescription}`,
    body && `PAGE TEXT: ${body.slice(0, 6000)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Fetches a page's own copy, under the same timeout budget as an AI call. */
export async function fetchPageCopy(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(AI_TIMEOUT_MS, 15000));
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Some sites serve a JS shell to unknown agents; ask for HTML plainly.
        'User-Agent': 'LaunchLoopBot/1.0 (+https://applybee.vercel.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) return '';
    return extractPageCopy(await res.text());
  } catch {
    // Unreachable, blocked, or too slow — the caller degrades to the URL alone.
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Models answer "product_name" with a placeholder when the source never named
 * the product — "Not specified", "Unknown", "N/A". Passing that through means
 * a project titled "Not specified" in the dashboard, which reads as broken
 * rather than as missing information.
 */
const PLACEHOLDER_NAME =
  /^(not specified|unspecified|unknown|n\/?a|none|untitled|product|your product)\.?$/i;

export function cleanProductName(name: unknown, fallback: string): string {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value || PLACEHOLDER_NAME.test(value)) return fallback;
  return value.slice(0, 80);
}

const SCHEMA = `{
  "product_name": "string",
  "summary": "string - 2-3 sentences on what this product does",
  "problem": "string - the problem it solves",
  "target_users": ["string"],
  "features": ["string"],
  "technical_capabilities": ["string"],
  "differentiators": ["string"],
  "evidence": ["string - quote or paraphrase the source text you relied on"],
  "confidence": 0.0
}`;

function fallbackAnalysis(name: string, text: string): ProductAnalysis {
  return {
    product_name: name,
    summary: text.slice(0, 240),
    problem: 'Described by the founder rather than inferred from code.',
    target_users: ['People who have this problem'],
    features: ['Described in the founder’s own words'],
    technical_capabilities: ['Not inspected'],
    differentiators: ['Stated by the founder'],
    evidence: [text.slice(0, 200)],
    confidence: 0.25,
  } as ProductAnalysis;
}

/** Builds an analysis from a deployed product's own page copy. */
export async function analyzeProductUrl(url: string): Promise<ProductAnalysis> {
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const copy = await fetchPageCopy(url);

  if (!copy || !isAIConfigured()) {
    return fallbackAnalysis(
      hostname,
      copy || `A product published at ${url}.`
    );
  }

  try {
    const result = await chatJSON<ProductAnalysis>(
      [
        {
          role: 'system',
          content:
            'You analyze a product from its own landing page copy. Judge only ' +
            'what the page actually claims. Where the page is vague, say so and ' +
            'lower confidence rather than inventing detail. Return JSON only.',
        },
        {
          role: 'user',
          content: `Analyze the product at ${url} from its own page copy.\n\n${copy}\n\nReturn JSON matching:\n${SCHEMA}`,
        },
      ],
      { temperature: 0.2, maxTokens: 2000 }
    );
    return { ...result, product_name: cleanProductName(result.product_name, hostname) };
  } catch (error) {
    console.error('[INPUT] Product URL analysis failed, using fallback:', error);
    return fallbackAnalysis(hostname, copy);
  }
}

/** Builds an analysis from a plain-text description the founder typed. */
export async function analyzeDescription(text: string): Promise<ProductAnalysis> {
  if (!isAIConfigured()) {
    return fallbackAnalysis('Your product', text);
  }
  try {
    const result = await chatJSON<ProductAnalysis>(
      [
        {
          role: 'system',
          content:
            'You analyze a product from a founder’s own short description. ' +
            'Do not invent features that were not described. Keep confidence ' +
            'honest — a sentence is less evidence than a codebase. Return JSON only.',
        },
        {
          role: 'user',
          content: `The founder describes their product as:\n\n"""${text}"""\n\nReturn JSON matching:\n${SCHEMA}`,
        },
      ],
      { temperature: 0.3, maxTokens: 2000 }
    );
    // Nothing named the product, so derive a readable label from the text.
    const derived = text.trim().split(/\s+/).slice(0, 4).join(' ');
    return {
      ...result,
      product_name: cleanProductName(result.product_name, derived || 'Your product'),
    };
  } catch (error) {
    console.error('[INPUT] Description analysis failed, using fallback:', error);
    return fallbackAnalysis('Your product', text);
  }
}
