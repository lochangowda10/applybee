import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { ApiError, apiError, readJsonBody, readString } from '@/lib/api';

/**
 * Recorded willingness to pay.
 *
 * This endpoint takes an email address and a plan and stores the pair. It does
 * not charge anyone and it never will — the value is a defensible count of
 * people who said they would pay, which is a stronger answer to "would anyone
 * pay for this" than a pricing table and a confident tone.
 *
 * Everything here is written so the number cannot quietly become a lie:
 * duplicates collapse, the address is validated, and the read path returns
 * masked addresses so the count can be shown publicly without publishing a
 * mailing list.
 */

const PLANS = new Set(['starter', 'growth']);

/** Deliberately permissive: rejecting valid addresses costs more than a typo does. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Masks an address so a public count can show who signed up without exposing them. */
function mask(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '•••';
  const head = user.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    await initDB();

    const email = readString(body.email, 'email', { max: 200 }).toLowerCase();
    const plan = readString(body.plan, 'plan', { max: 20 }).toLowerCase();
    const note = readString(body.note, 'note', { required: false, max: 500 });

    if (!EMAIL.test(email)) {
      throw new ApiError('That does not look like an email address.', 400);
    }
    if (!PLANS.has(plan)) {
      throw new ApiError(`Unknown plan "${plan}".`, 400);
    }

    // ON CONFLICT makes a resubmission a no-op rather than a second signup.
    await db`
      INSERT INTO purchase_intents (id, email, plan, note, created_at)
      VALUES (${crypto.randomUUID()}, ${email}, ${plan}, ${note || null}, NOW())
      ON CONFLICT (email, plan) DO NOTHING
    `;

    const rows = await db<{ count: string }>`SELECT COUNT(*) as count FROM purchase_intents`;
    return NextResponse.json({ recorded: true, total: Number(rows[0]?.count ?? 0) });
  } catch (error: unknown) {
    return apiError('INTEREST', error);
  }
}

export async function GET() {
  try {
    await initDB();

    const totals = await db<{ plan: string; count: string }>`
      SELECT plan, COUNT(*) as count FROM purchase_intents GROUP BY plan
    `;
    const recent = await db<{ email: string; plan: string; created_at: string }>`
      SELECT email, plan, created_at FROM purchase_intents ORDER BY created_at DESC LIMIT 12
    `;

    const byPlan: Record<string, number> = {};
    let total = 0;
    for (const row of totals) {
      const n = Number(row.count);
      byPlan[row.plan] = n;
      total += n;
    }

    return NextResponse.json({
      total,
      byPlan,
      // Committed value, not revenue: these people have not been charged.
      committedUsd: (byPlan.starter ?? 0) * 19 + (byPlan.growth ?? 0) * 79,
      recent: recent.map((r) => ({
        email: mask(r.email),
        plan: r.plan,
        created_at: r.created_at,
      })),
    });
  } catch (error: unknown) {
    return apiError('INTEREST:GET', error);
  }
}
