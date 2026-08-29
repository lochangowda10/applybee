/**
 * AI Provider Abstraction Layer (Production-hardened)
 *
 * Supports any OpenAI-compatible API including:
 * - OpenAI GPT-5+ (max_completion_tokens, no custom temperature, no response_format)
 * - OpenAI GPT-4o (max_tokens, custom temperature, response_format)
 * - Fireworks AI (max_tokens)
 * - Other compatible providers
 *
 * Auto-detects and retries when parameters are unsupported.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.AI_MODEL || 'gpt-5-nano';

export function isAIConfigured(): boolean {
  return OPENAI_API_KEY.length > 0;
}

export function getAIStatus(): { configured: boolean; provider: string; model: string } {
  return {
    configured: isAIConfigured(),
    provider: OPENAI_BASE_URL.includes('openai') ? 'OpenAI' : OPENAI_BASE_URL,
    model: MODEL,
  };
}

export async function chatCompletion(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { temperature?: number; maxTokens?: number; json?: boolean } = {}
): Promise<string> {
  if (!isAIConfigured()) {
    throw new Error(
      'AI not configured. Set OPENAI_API_KEY in your environment variables. ' +
      'The application is running in DEMO MODE with mock responses.'
    );
  }

  const fetchOpts = {
    method: 'POST' as const,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
  };

  async function makeRequest(body: Record<string, unknown>): Promise<Response> {
    return fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      ...fetchOpts,
      body: JSON.stringify(body),
    });
  }

  // Build body — start with all params, let the provider reject what it doesn't support
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
  };
  if (options.temperature != null) {
    body.temperature = options.temperature;
  }
  // Fireworks uses max_tokens; OpenAI GPT-5 uses max_completion_tokens
  if (OPENAI_BASE_URL.includes('fireworks')) {
    body.max_tokens = options.maxTokens ?? 4096;
  } else {
    body.max_completion_tokens = options.maxTokens ?? 4096;
  }
  if (options.json) {
    body.response_format = { type: 'json_object' };
  }

  let response = await makeRequest(body);

  // Retry loop — strip unsupported params one by one on 400 errors
  // Max 3 retries to avoid infinite loops
  for (let attempt = 0; attempt < 3 && response.status === 400; attempt++) {
    const errText = await response.text();

    if (errText.includes('temperature') && errText.includes('not supported')) {
      delete body.temperature;
    } else if (errText.includes('max_tokens') && errText.includes('not supported')) {
      // Switch between max_tokens and max_completion_tokens
      if ('max_completion_tokens' in body) {
        delete body.max_completion_tokens;
        body.max_tokens = options.maxTokens ?? 4096;
      } else if ('max_tokens' in body) {
        delete body.max_tokens;
        body.max_completion_tokens = options.maxTokens ?? 4096;
      }
    } else if (errText.includes('response_format') || errText.includes('json_object')) {
      delete body.response_format;
    } else {
      // Unknown 400 error — don't retry
      throw new Error(`AI API error (400): ${errText.slice(0, 300)}`);
    }

    response = await makeRequest(body);
  }

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 429) {
      throw new Error('AI provider rate limit reached. Please try again in a moment.');
    }
    if (response.status === 401) {
      throw new Error('AI provider authentication failed. Check your OPENAI_API_KEY.');
    }
    throw new Error(`AI API error (${response.status}): ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

export async function chatJSON<T>(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  const raw = await chatCompletion(messages, { ...options, json: true });
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error('AI returned invalid JSON. Please try again.');
  }
}
