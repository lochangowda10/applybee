import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { ApiError, apiError, readJsonBody, readString } from '@/lib/api';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import {
  findUserByReferralCode,
  getSessionUser,
  isAuthEnabled,
  maskEmail,
  normalizeReferralCode,
} from '@/lib/auth';

/**
 * Claims a referral code.
 *
 * The claimer must be signed in — a claim is a durable fact about who credited
 * whom, so it has to hang off an account rather than an anonymous browser
 * cookie. The referrer gets the credit; nobody can claim their own code; and
 * the unique pair in the table makes a repeat claim a no-op rather than a
 * double credit.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    await initDB();

    if (!isAuthEnabled()) {
      throw new ApiError(
        'Accounts are not configured yet. Set AUTH_SECRET in the environment variables.',
        503
      );
    }

    const claimer = await getSessionUser(request);
    if (!claimer) {
      throw new ApiError('Sign in before claiming a referral.', 401);
    }

    const rl = await rateLimit(`referral-claim:${clientIp(request)}`, 10, 3600);
    if (rl.limited) return rl.response;

    const raw = readString(body.code, 'code', { max: 32 });
    const code = normalizeReferralCode(raw);
    if (!code) {
      throw new ApiError('Enter a referral code to claim.', 400);
    }

    const referrer = await findUserByReferralCode(code);
    if (!referrer) {
      throw new ApiError('That referral code does not exist.', 400);
    }
    if (referrer.id === claimer.id) {
      throw new ApiError('You cannot claim your own referral.', 400);
    }

    await db`
      INSERT INTO referral_claims (id, referrer_user_id, claimer_user_id, claimed_at)
      VALUES (${crypto.randomUUID()}, ${referrer.id}, ${claimer.id}, NOW())
      ON CONFLICT (referrer_user_id, claimer_user_id) DO NOTHING
    `;

    return NextResponse.json({
      claimed: true,
      referrer: maskEmail(referrer.email),
    });
  } catch (error: unknown) {
    return apiError('REFERRAL:CLAIM', error);
  }
}
