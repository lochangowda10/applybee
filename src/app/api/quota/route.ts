import { NextRequest, NextResponse } from 'next/server';
import { initDB } from '@/lib/init';
import { apiError } from '@/lib/api';
import { checkQuota, quotaMessage, quotaLimits, isQuotaEnforced } from '@/lib/quota';

/**
 * What this visitor has left.
 *
 * Exists so the page can state the real allowance instead of a number written
 * into the copy by hand. The pricing on the homepage and the rule enforced in
 * /api/analyze are then the same fact read from one place, which is the only
 * way they stay in agreement after someone changes a limit.
 */
export async function GET(request: NextRequest) {
  try {
    await initDB();
    const state = await checkQuota(request);
    const limits = quotaLimits();

    return NextResponse.json({
      enforced: isQuotaEnforced(),
      signedUp: state.signedUp,
      usedWeek: state.usedWeek,
      usedMonth: state.usedMonth,
      limitWeek: state.limitWeek,
      limitMonth: state.limitMonth,
      remaining: state.remaining,
      blocked: state.blocked,
      reason: state.reason,
      resetsAt: state.resetsAt,
      signupWouldHelp: state.signupWouldHelp,
      message: state.blocked ? quotaMessage(state) : null,
      // The offer itself, so the page never hard-codes a number it might
      // outlive.
      tiers: {
        anonymousPerWeek: limits.freeWeek,
        anonymousPerMonth: limits.freeMonth,
        signedUpPerMonth: limits.signedMonth,
      },
    });
  } catch (error: unknown) {
    return apiError('QUOTA', error);
  }
}
