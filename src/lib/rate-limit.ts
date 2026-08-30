import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Rate limiting, backed by the same Neon Postgres the product already uses.
 *
 * Why not an in-memory counter: Vercel runs many disposable instances, so a
 * per-process Map limits nothing — each instance would have its own count.
 * Why not a new service (Redis/Upstash): the database is already on the
 * critical path of every route here, and one upsert round trip is cheaper
 * than provisioning and trusting a second store mid-hackathon.
 *
 * The window is a fixed bucket (upsert + increment), not a sliding log —
 * exactness matters less than bounding cost, and a fixed window is one
 * statement with no row per hit.
 *
 * Two deliberate choices:
 *
 * - Fail OPEN. If the limiter itself errors (DB hiccup), the request is
 *   allowed and the failure is logged. Rate limiting is a cost control, not
 *   an authorization boundary — it must never take the product down in front
 *   of a user because its own plumbing broke.
 * - Generous limits. The goal is to stop scripts and bots farming AI calls,
 *   not to throttle humans. A live demo — many judges on one venue NAT —
 *   must never trip these, so per-IP ceilings sit far above human speed.
 */

export type RateLimitResult =
  | { limited: false }
  | { limited: true; retryAfter: number; response: NextResponse };

/** Best-effort client IP. Vercel sets x-forwarded-for; the first hop is the client. */
export function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Increments the caller's bucket and reports whether they are over the limit.
 *
 * `key` should include the route and the identifier, e.g. `analyze:1.2.3.4`,
 * so limits are per-endpoint rather than one global bucket.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const windowMs = windowSeconds * 1000;
    const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

    const rows = await db<{ count: number }>`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${key}, ${windowStart.toISOString()}, 1)
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = rate_limits.count + 1
      RETURNING count
    `;

    const count = Number(rows[0]?.count ?? 1);
    if (count <= limit) {
      // Occasional cleanup so the table does not grow forever. Probabilistic
      // rather than scheduled: serverless has no cron running in-process.
      if (Math.random() < 0.01) {
        db`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day'`.catch(
          () => {}
        );
      }
      return { limited: false };
    }

    const retryAfter = Math.max(
      1,
      Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000)
    );
    return {
      limited: true,
      retryAfter,
      response: NextResponse.json(
        { error: 'Too many requests. Wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      ),
    };
  } catch (err) {
    // Fail open: log and allow. See the module comment for why.
    console.error('[RATE-LIMIT] Check failed, allowing request:', err);
    return { limited: false };
  }
}
