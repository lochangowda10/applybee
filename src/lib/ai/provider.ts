/**
 * AI Provider Abstraction Layer (Production-hardened)
 *
 * Supports any OpenAI-compatible API including:
 * - OpenAI (max_completion_tokens for GPT-5+)
 * - Fireworks AI (max_tokens)
 * - Other compatible providers
 *
 * Auto-detects and retries with the correct parameter name.
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

// Detect if provider is Fireworks (uses max_tokens, not max_completion_tokens)
function isFireworksProvider(): boolean {
  return OPENAI_BASE_URL.includes('fireworks');
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

  const useFireworks = isFireworksProvider();

  function buildBody(useMaxCompletionTokens: boolean): Record<string, unknown> {
    const b: Record<string, unknown> = {
      model: MODEL,
      messages,
      temperature: options.temperature ?? 0.3,
    };
    // Fireworks uses max_tokens; OpenAI GPT-5 uses max_completion_tokens
    if (useMaxCompletionTokens) {
      b.max_completion_tokens = options.maxTokens ?? 4096;
    } else {
      b.max_tokens = options.maxTokens ?? 4096;
    }
    if (options.json) {
      b.response_format = { type: 'json_object' };
    }
    return b;
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

  // Fireworks: start with max_tokens. Others: start with max_completion_tokens
  let useMaxCompletionTokens = !useFireworks;
  let body = buildBody(useMaxCompletionTokens);
  let response = await makeRequest(body);

  // Auto-detect and retry with correct token param if needed
  if (response.status === 400) {
    const errText = await response.text();

    // Check if it's about max_tokens vs max_completion_tokens
    if (errText.includes('max_tokens') && errText.includes('not supported')) {
      // Switch parameter name and retry
      useMaxCompletionTokens = !useMaxCompletionTokens;
      body = buildBody(useMaxCompletionTokens);
      response = await makeRequest(body);
    } else if (errText.includes('response_format') || errText.includes('json_object')) {
      // response_format not supported, retry without it
      delete body.response_format;
      response = await makeRequest(body);
    } else {
      // Some other 400 error
      throw new Error(`AI API error (400): ${errText.slice(0, 300)}`);
    }
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
