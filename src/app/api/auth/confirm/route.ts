import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { ApiError, apiError, readJsonBody, readString } from '@/lib/api';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import {
  consumeMagicToken,
  isAuthEnabled,
  setSessionCookie,
} from '@/lib/auth';

/**
 * Exchanges a magic-link token for a session.
 *
 * This is the only path that sets the session cookie. The token is consumed
 * atomically in the same statement that reads it, so two tabs racing to open
 * the same emailed link cannot both sign in on it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    await initDB();

    if (!isAuthEnabled()) {
      throw new ApiError(
        'Sign-in is not configured yet. Set AUTH_SECRET in the environment variables.',
        503
      );
    }

    // Brute-forcing a 256-bit token is infeasible, but the limiter keeps a
    // misconfigured client from hammering the token table for nothing.
    const rl = await rateLimit(`auth-confirm:${clientIp(request)}`, 20, 3600);
    if (rl.limited) return rl.response;

    const token = readString(body.token, 'token', { max: 200 });
    const userId = await consumeMagicToken(token);
    if (!userId) {
      throw new ApiError(
        'That link is invalid or has expired. Request a new one.',
        400
      );
    }

    const users = await db<{ id: string; email: string; referral_code: string }>`
      SELECT id, email, referral_code FROM users WHERE id = ${userId}
    `;
    if (users.length === 0) {
      throw new ApiError('That account no longer exists.', 400);
    }

    const response = NextResponse.json({ user: users[0] });
    setSessionCookie(response, users[0].id);
    return response;
  } catch (error: unknown) {
    return apiError('AUTH:CONFIRM', error);
  }
}
