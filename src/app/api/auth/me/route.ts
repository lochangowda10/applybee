import { NextRequest, NextResponse } from 'next/server';
import { initDB } from '@/lib/init';
import { getSessionUser } from '@/lib/auth';

/**
 * Returns the signed-in user, or null. The client uses this to decide whether
 * to render a "Sign in" or an "Account" entry in the nav.
 */
export async function GET(request: NextRequest) {
  await initDB();
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ user: null });
  const { id, email, referral_code, created_at } = user;
  return NextResponse.json({ user: { id, email, referral_code, created_at } });
}
