import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { clientIp } from '@/lib/rate-limit';

/**
 * The free tier, enforced.
 *
 * This is a different thing from lib/rate-limit.ts and the distinction
 * matters. Rate limiting is an abuse control: it bounds how fast anyone can
 * hammer an endpoint, it fails open, and tripping it is a sign something went
 * wrong. This is a *product* rule: how many experiments a person gets for
 * free. Tripping it is a normal, expected outcome that the pricing page
 * promises, so it fails CLOSED and it answers with an offer rather than an
 * apology.
 *
 * The policy:
 *
 *   anonymous   1 per week, and no more than 4 per month
 *   signed up   8 per month, no weekly ceiling
 *
 * Signing up lifts the weekly gate immediately. That is the whole point of
 * the gate — a wall that stays up after you do the thing it asked for is just
 * a wall — so the weekly limit is deliberately not applied to signed-up
 * callers even though 8 a month would otherwise permit it.
 *
 * Keyed by IP, because that is what the founder asked for and it is the only
 * identifier a stranger cannot trivially reset. The IP is never stored: what
 * goes in the database is an HMAC of it, so the ledger can count without the
 * product holding a list of who visited from where.
 *
 * Every number below is env-overridable. A venue puts a whole room behind one
 * NAT, and a limit that is correct in production can be wrong on a stage; a
 * deploy that fixes it in forty seconds beats a code change under pressure.
 */

const SIGNUP_COOKIE = 'll_signup';
const SIGNUP_MAX_AGE = 60 * 60 * 24 * 365;

/** Reads a positive integer from the environment, falling back to a default. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function quotaLimits() {
  return {
    freeWeek: envInt('QUOTA_FREE_WEEK', 1),
    freeMonth: envInt('QUOTA_FREE_MONTH', 4),
    signedMonth: envInt('QUOTA_SIGNED_MONTH', 8),
  };
}

/** A hard off switch, for the case where a live demo hits the wall. */
export function isQuotaEnforced(): boolean {
  return process.env.QUOTA_DISABLED !== '1';
}

function secret(): string | null {
  const value = process.env.OWNER_SECRET;
  return value && value.length >= 16 ? value : null;
}

/**
 * Identifies the caller for counting, without storing the address itself.
 *
 * Uses OWNER_SECRET when configured so the hash is not reversible by anyone
 * holding a copy of the table, and falls back to a plain digest when it is
 * not — an unsalted hash of an IPv4 address is guessable, but the alternative
 * is no free tier at all on a deployment that never set a secret.
 */
export function ipKey(request: NextRequest): string {
  const ip = clientIp(request);
  const key = secret();
  return key
    ? createHmac('sha256', key).update(ip).digest('base64url').slice(0, 32)
    : createHash('sha256').update(ip).digest('base64url').slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* Signup state                                                        */
/* ------------------------------------------------------------------ */

function sign(value: string, key: string): string {
  return createHmac('sha256', key).update(value).digest('base64url');
}

function verify(raw: string, key: string): string | null {
  const at = raw.lastIndexOf('.');
  if (at <= 0) return null;
  const value = raw.slice(0, at);
  const given = Buffer.from(raw.slice(at + 1));
  const expected = Buffer.from(sign(value, key));
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? value : null;
}

/**
 * Whether this browser has joined the waitlist.
 *
 * Signed rather than a bare flag, so nobody grants themselves the larger
 * allowance by setting a cookie by hand. Without OWNER_SECRET there is no way
 * to tell a real signup from a forged one, so everyone is treated as
 * anonymous rather than everyone being trusted.
 */
export function isSignedUp(request: NextRequest): boolean {
  const key = secret();
  if (!key) return false;
  const raw = request.cookies.get(SIGNUP_COOKIE)?.value;
  return raw ? verify(raw, key) !== null : false;
}

/** Marks this browser as signed up. Called after a waitlist row is recorded. */
export function setSignedUp(response: NextResponse, email: string): void {
  const key = secret();
  if (!key) return;
  const value = `${email}.${sign(email, key)}`;
  response.cookies.set(SIGNUP_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SIGNUP_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
}

/* ------------------------------------------------------------------ */
/* The ledger                                                          */
/* ------------------------------------------------------------------ */

export type QuotaState = {
  signedUp: boolean;
  usedWeek: number;
  usedMonth: number;
  limitWeek: number | null;
  limitMonth: number;
  remaining: number;
  blocked: boolean;
  /** Which rule stopped them, for a message that says something true. */
  reason: 'week' | 'month' | null;
  resetsAt: string | null;
  /** True when joining the waitlist would unblock them right now. */
  signupWouldHelp: boolean;
};

function startOfNextWeek(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString();
}

function startOfNextMonth(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString();
}

/**
 * Counts what this caller has already spent and decides whether they may
 * start another experiment.
 *
 * Counts rows in `projects`, which is the table a new experiment is born in,
 * rather than a separate tally that could drift away from reality.
 */
export async function checkQuota(request: NextRequest): Promise<QuotaState> {
  const limits = quotaLimits();
  const signedUp = isSignedUp(request);

  const limitMonth = signedUp ? limits.signedMonth : limits.freeMonth;
  const limitWeek = signedUp ? null : limits.freeWeek;

  if (!isQuotaEnforced()) {
    return {
      signedUp,
      usedWeek: 0,
      usedMonth: 0,
      limitWeek,
      limitMonth,
      remaining: limitMonth,
      blocked: false,
      reason: null,
      resetsAt: null,
      signupWouldHelp: false,
    };
  }

  const key = ipKey(request);

  let usedWeek = 0;
  let usedMonth = 0;
  try {
    const rows = await db<{ week: number; month: number }>`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int  AS week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS month
      FROM projects
      WHERE creator_ip_hash = ${key}
    `;
    usedWeek = Number(rows[0]?.week ?? 0);
    usedMonth = Number(rows[0]?.month ?? 0);
  } catch (err) {
    /**
     * Fails CLOSED is the rule for a paid boundary, but not for a database
     * that briefly could not answer. Refusing every founder because one query
     * failed turns a transient fault into an outage, and the abuse ceiling in
     * lib/rate-limit.ts still applies underneath. Logged loudly so a real
     * failure is visible rather than silently free.
     */
    console.error('[QUOTA] Ledger unavailable, allowing this one:', err);
    return {
      signedUp,
      usedWeek: 0,
      usedMonth: 0,
      limitWeek,
      limitMonth,
      remaining: limitMonth,
      blocked: false,
      reason: null,
      resetsAt: null,
      signupWouldHelp: false,
    };
  }

  const overMonth = usedMonth >= limitMonth;
  const overWeek = limitWeek !== null && usedWeek >= limitWeek;

  // Month is reported first when both are hit: signing up cannot fix a month
  // that is already spent, and offering it would be a lie.
  const reason: 'week' | 'month' | null = overMonth
    ? 'month'
    : overWeek
      ? 'week'
      : null;

  return {
    signedUp,
    usedWeek,
    usedMonth,
    limitWeek,
    limitMonth,
    remaining: Math.max(0, limitMonth - usedMonth),
    blocked: reason !== null,
    reason,
    resetsAt:
      reason === 'month'
        ? startOfNextMonth()
        : reason === 'week'
          ? startOfNextWeek()
          : null,
    // Only true when the larger allowance would actually admit them.
    signupWouldHelp:
      reason === 'week' && !signedUp && usedMonth < limits.signedMonth,
  };
}

/**
 * The message a blocked caller sees. Says what happened and what to do.
 *
 * Every number is read from the configured limits rather than written into
 * the sentence. A message that hard-codes "8" becomes a lie the moment
 * QUOTA_SIGNED_MONTH is changed, and the whole point of this module is that
 * what the product says and what it enforces are the same fact.
 */
export function quotaMessage(state: QuotaState): string {
  const signed = quotaLimits().signedMonth;
  if (state.reason === 'week') {
    return state.signupWouldHelp
      ? `That is your free experiment for this week. Join the waitlist and you can run ${signed} a month, starting now.`
      : 'That is your free experiment for this week. The next one unlocks in seven days.';
  }
  if (state.signedUp) {
    return `You have used all ${state.limitMonth} experiments this month. They reset in 30 days.`;
  }
  return `You have used all ${state.limitMonth} free experiments this month. Join the waitlist to run ${signed} a month instead.`;
}

/** The 429 a blocked caller gets, carrying enough for the UI to offer the fix. */
export function quotaResponse(state: QuotaState): NextResponse {
  return NextResponse.json(
    {
      error: quotaMessage(state),
      quota: {
        used: state.reason === 'week' ? state.usedWeek : state.usedMonth,
        limit: state.reason === 'week' ? state.limitWeek : state.limitMonth,
        scope: state.reason,
        signedUp: state.signedUp,
        signupWouldHelp: state.signupWouldHelp,
        resetsAt: state.resetsAt,
      },
    },
    { status: 429 }
  );
}

/** Stamps the caller onto a newly created project so it counts next time. */
export async function recordProjectCreator(
  projectId: string,
  request: NextRequest
): Promise<void> {
  try {
    await db`UPDATE projects SET creator_ip_hash = ${ipKey(request)} WHERE id = ${projectId}`;
  } catch (err) {
    // An unstamped project is invisible to the ledger, which is the generous
    // direction to fail in. Never worth failing the founder's request over.
    console.error('[QUOTA] Could not stamp project creator:', err);
  }
}
