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
const MODEL = process.env.AI_MODEL || 'gpt-5-nano';

/**
 * Normalize the configured base URL to the root the Chat Completions path hangs
 * off of. People routinely paste a full endpoint into OPENAI_BASE_URL, which
 * would otherwise concatenate into nonsense like
 * `/v1/responses/chat/completions` and 404 at request time.
 *
 * Strips trailing slashes, an already-appended `/chat/completions`, and
 * `/responses` (OpenAI's Responses API root — a different protocol from the
 * Chat Completions one this module speaks).
 */
function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '');
  url = url.replace(/\/chat\/completions$/i, '');
  url = url.replace(/\/responses$/i, '');
  return url.replace(/\/+$/, '');
}

const OPENAI_BASE_URL = normalizeBaseUrl(
  process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
);

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

  const isFireworks = OPENAI_BASE_URL.includes('fireworks');

  // Reasoning-family models (gpt-5*, o1/o3/o4) reject any temperature other
  // than the default and reject `max_tokens`. Skip the round trip and get it
  // right on the first attempt rather than relying on the repair loop below.
  const isReasoningModel = /^(gpt-5|o[134])/i.test(MODEL);

  /**
   * Reasoning models spend hidden reasoning tokens out of the SAME budget as
   * visible output. Measured: gpt-5-nano burns ~1100 reasoning tokens on a
   * 51-token prompt. A caller asking for 2000 tokens of JSON therefore gets an
   * empty completion, because reasoning consumed the allowance before a single
   * character of content was emitted.
   *
   * So for these models the requested size is treated as the *content* budget
   * and generous reasoning headroom is added on top.
   */
  const requestedTokens = options.maxTokens ?? 4096;
  const tokenBudget = isReasoningModel
    ? Math.max(requestedTokens * 4, 8000)
    : requestedTokens;

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
  };
  if (options.temperature != null && !isReasoningModel) {
    body.temperature = options.temperature;
  }
  // Keep reasoning short — this is extraction and copywriting, not maths, and
  // every reasoning token is latency the audience watches tick by.
  if (isReasoningModel) {
    body.reasoning_effort = 'low';
  }
  // Fireworks uses max_tokens; OpenAI GPT-5 uses max_completion_tokens
  if (isFireworks) {
    body.max_tokens = tokenBudget;
  } else {
    body.max_completion_tokens = tokenBudget;
  }
  // Only send response_format for providers that support it (not Fireworks)
  if (options.json && !isFireworks) {
    body.response_format = { type: 'json_object' };
  }

  let response = await makeRequest(body);

  /**
   * Repair loop for rejected parameters.
   *
   * Dispatch on the structured `error.param` field rather than substring
   * matching the prose: OpenAI phrases the same rejection as "is not
   * supported", "does not support", and "Unsupported value" depending on the
   * model, and matching on any one of those silently fails for the others.
   * `param` is stable. The message is only a fallback for providers that
   * omit it.
   */
  const stripped = new Set<string>();

  for (let attempt = 0; attempt < 4 && response.status === 400; attempt++) {
    const errText = await response.text();

    let param = '';
    try {
      param = JSON.parse(errText)?.error?.param ?? '';
    } catch {
      // Provider returned non-JSON; fall back to the message text below.
    }

    const haystack = `${param} ${errText}`.toLowerCase();
    const mentions = (needle: string) => haystack.includes(needle);

    let repaired = false;

    if ('temperature' in body && mentions('temperature')) {
      delete body.temperature;
      stripped.add('temperature');
      repaired = true;
    } else if (mentions('max_completion_tokens') && 'max_completion_tokens' in body) {
      delete body.max_completion_tokens;
      if (!stripped.has('max_tokens')) body.max_tokens = options.maxTokens ?? 4096;
      stripped.add('max_completion_tokens');
      repaired = true;
    } else if (mentions('max_tokens') && 'max_tokens' in body) {
      delete body.max_tokens;
      if (!stripped.has('max_completion_tokens')) {
        body.max_completion_tokens = options.maxTokens ?? 4096;
      }
      stripped.add('max_tokens');
      repaired = true;
    } else if (
      'response_format' in body &&
      (mentions('response_format') || mentions('json_object'))
    ) {
      delete body.response_format;
      stripped.add('response_format');
      repaired = true;
    } else if ('reasoning_effort' in body && mentions('reasoning_effort')) {
      delete body.reasoning_effort;
      stripped.add('reasoning_effort');
      repaired = true;
    }

    if (!repaired) {
      // Nothing left to strip, or an error we do not know how to repair.
      // Retrying an identical body would just burn demo time.
      throw new Error(`AI API error (400): ${errText.slice(0, 300)}`);
    }

    console.warn(`[AI] Provider rejected "${param || 'a parameter'}"; retrying without it.`);
    response = await makeRequest(body);
  }

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 429) {
      throw new Error('AI provider rate limit reached. Please try again in a moment.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('AI provider authentication failed. Check your OPENAI_API_KEY.');
    }
    if (response.status === 404) {
      throw new Error(
        `AI endpoint not found at ${OPENAI_BASE_URL}/chat/completions. ` +
        'Check OPENAI_BASE_URL (it should be the API root, e.g. ' +
        'https://api.openai.com/v1) and that AI_MODEL is a model this ' +
        `provider serves (currently "${MODEL}").`
      );
    }
    throw new Error(`AI API error (${response.status}): ${err.slice(0, 300)}`);
  }

  // Parse defensively: a proxy or gateway can return a 200 with HTML, and a
  // non-OpenAI provider can return a 200 with a different envelope. Neither
  // should surface as an unhandled TypeError.
  const rawText = await response.text();
  let data: { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(
      `AI provider returned a non-JSON response (${response.status}): ${rawText.slice(0, 200)}`
    );
  }

  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    const reason = choice?.finish_reason ?? 'unknown';
    if (reason === 'length') {
      throw new Error(
        `AI ran out of tokens before producing output (finish_reason=length, ` +
        `budget=${tokenBudget}). The model spent the whole allowance on ` +
        'reasoning. Raise maxTokens for this call.'
      );
    }
    throw new Error(`AI provider returned an empty completion (finish_reason=${reason}).`);
  }
  return content;
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

/**
 * Like `chatJSON`, but for prompts that ask for a top-level JSON array.
 *
 * `response_format: {type:'json_object'}` forbids a bare array at the top
 * level, so a model told to "return a JSON array" complies by wrapping it —
 * `{"hypotheses":[...]}`, `{"items":[...]}`, and so on, with the key varying
 * run to run. This unwraps whichever shape comes back rather than letting the
 * caller crash on a non-iterable.
 */
export async function chatJSONArray<T>(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<T[]> {
  const parsed = await chatJSON<unknown>(messages, options);

  if (Array.isArray(parsed)) return parsed as T[];

  if (parsed && typeof parsed === 'object') {
    // Take the first property whose value is a non-empty array.
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length > 0) return value as T[];
    }
    // A single object where an array of one was expected.
    if (Object.keys(parsed as object).length > 0) return [parsed as T];
  }

  throw new Error('AI returned no usable array. Please try again.');
}
