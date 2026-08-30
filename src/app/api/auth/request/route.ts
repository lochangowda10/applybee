import { NextRequest, NextResponse } from 'next/server';
import { initDB } from '@/lib/init';
import { ApiError, apiError, readJsonBody, readString } from '@/lib/api';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import {
  createMagicToken,
  findOrCreateUser,
  isValidEmail,
  sendMagicLinkEmail,
} from '@/lib/auth';

/**
 * Starts a magic-link sign-in.
 *
 * Every valid address gets the same "check your inbox" response, whether or
 * not an account exists — a different answer would let a visitor enumerate
 * which addresses have signed up. The link lands on /auth/confirm, where the
 * token is consumed exactly once to set the session cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    await initDB();

    // Email is the only identity in the flow; cap how fast one IP can spray it.
    const rl = await rateLimit(`auth-request:${clientIp(request)}`, 10, 3600);
    if (rl.limited) return rl.response;

    const email = readString(body.email, 'email', { max: 200 }).toLowerCase();
    const next = readString(body.next, 'next', { required: false, max: 300 });
    if (!isValidEmail(email)) {
      throw new ApiError('That does not look like an email address.', 400);
    }

    const user = await findOrCreateUser(email);
    const rawToken = await createMagicToken(user.id);

    const base = process.env.NEXT_PUBLIC_APP_URL || '';
    const confirmUrl = `${base}/auth/confirm?token=${encodeURIComponent(rawToken)}${
      next ? `&next=${encodeURIComponent(next)}` : ''
    }`;

    const sent = await sendMagicLinkEmail(user.email, confirmUrl);

    // Always the same shape regardless of account existence.
    return NextResponse.json({ sent: sent.delivered, devLink: sent.devLink });
  } catch (error: unknown) {
    return apiError('AUTH:REQUEST', error);
  }
}
