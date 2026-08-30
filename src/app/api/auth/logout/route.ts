import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

/** Ends the session by expiring the cookie. */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
