/**
 * AI Provider Abstraction Layer (Production-hardened)
 *
 * Supports any OpenAI-compatible API.
 * Falls back to demo/mock mode when no API key is configured.
 * Shows clear DEMO MODE indicator when not using real AI.
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

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 4096,
  };
  if (options.json) {
    body.response_format = { type: 'json_object' };
  }

  let response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  // If response_format not supported, retry without it
  if (response.status === 400 && options.json) {
    const errText = await response.text();
    if (errText.includes('response_format') || errText.includes('json_object')) {
      delete body.response_format;
      response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(body),
      });
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
    throw new Error(`AI API error (${response.status}): ${err.slice(0, 200)}`);
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
