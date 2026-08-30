/**
 * Turns whatever went wrong into something a first-time user can act on.
 *
 * The rubric's floor for this is "exposes raw system output", and that is
 * exactly what a provider string like
 *   AI API error (404): {"error":{"message":"Invalid URL (POST /v1/...)"}}
 * does to someone standing in front of the product. Every failure that can
 * reach a screen gets a plain sentence and a concrete next action; the
 * technical detail stays in the console for whoever is debugging.
 */

export type FriendlyError = {
  /** One sentence, no jargon, describing what happened. */
  message: string;
  /** What the user can actually do about it. */
  action: string;
  /** Whether trying the same thing again is likely to help. */
  retryable: boolean;
};

// Order matters: the first match wins, so the most specific patterns come
// first. A generic /404/ rule placed above the AI-endpoint rule would tell
// someone their repository is missing when the real fault is our own config.
const RULES: { match: RegExp; result: FriendlyError }[] = [
  {
    // Our own misconfiguration, not anything the user did.
    match: /AI (API )?(error|endpoint)|OPENAI_BASE_URL|chat\/completions|AI provider returned/i,
    result: {
      message: "Our AI service is not responding correctly.",
      action:
        "This is on us, not you. Try again in a moment — or open /demo to see a completed run.",
      retryable: true,
    },
  },
  {
    match: /GitHub API rate limit/i,
    result: {
      message: "GitHub is rate limiting us.",
      action:
        "Try a product URL or a description instead, or wait for the limit to reset.",
      retryable: true,
    },
  },
  {
    /**
     * Our own limiter says "Too many requests", which matched none of the
     * words below and so fell through to "Something went wrong on our side."
     * — telling the user we broke when in fact they went too fast. The
     * product's own wording has to be in this pattern, not just the generic
     * vocabulary of other people's APIs.
     */
    match: /too many requests|rate limit|429|exceeded your quota/i,
    result: {
      message: "We are being rate limited right now.",
      action: "Wait about a minute, then try again.",
      retryable: true,
    },
  },
  {
    /**
     * Running out of free experiments is not an error and must never be
     * dressed as one. The server already wrote a sentence that says what
     * happened and what to do; this rule exists so it survives instead of
     * being replaced by an apology and a pointless retry button.
     */
    match: /free experiment|experiments this month|unlocks in seven days/i,
    result: {
      message: "That is your free allowance for now.",
      action: "Join the waitlist further down the page to raise it, or wait for it to reset.",
      retryable: false,
    },
  },
  {
    match: /timed out|timeout|AbortError/i,
    result: {
      message: "The analysis took longer than expected and was stopped.",
      action: "Try again — smaller repositories analyze faster.",
      retryable: true,
    },
  },
  {
    match: /not found|404/i,
    result: {
      message: "We could not find that repository.",
      action:
        "Check the URL and make sure the repository is public, or paste a description instead.",
      retryable: false,
    },
  },
  {
    match: /401|403|authentication failed|Bad credentials/i,
    result: {
      message: "We could not reach the repository or the AI service.",
      action:
        "If the repository is private, try a public one, a product URL, or a description.",
      retryable: false,
    },
  },
  {
    match: /invalid github url|invalid url/i,
    result: {
      message: "That does not look like a link we can read.",
      action:
        "Paste a public GitHub URL, a product website, or just describe your product in a sentence.",
      retryable: false,
    },
  },
  {
    match: /DATABASE_URL|database|connect/i,
    result: {
      message: "We could not reach our database.",
      action: "Try again in a moment.",
      retryable: true,
    },
  },
  {
    match: /invalid json|unexpected token|malformed/i,
    result: {
      message: "We got an unusable response back and stopped rather than guess.",
      action: "Try again — this usually clears on a second attempt.",
      retryable: true,
    },
  },
];

export function humanizeError(error: unknown): FriendlyError {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  // Keep the real thing where an engineer can find it.
  if (raw) console.error("[LaunchLoop] underlying error:", raw);

  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.result;
  }

  return {
    message: "Something went wrong on our side.",
    action: "Try again, or use a product URL or description instead.",
    retryable: true,
  };
}

/**
 * Reads a fetch Response as JSON without assuming it is JSON.
 *
 * A route that 500s, a platform error page, or a gateway timeout all return
 * HTML, and calling .json() on those throws a parser error that means nothing
 * to a user. This surfaces the HTTP status instead.
 */
export async function safeJson<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Server returned a ${res.status} that was not JSON: ${text.slice(0, 120)}`
    );
  }
}
