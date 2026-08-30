import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

/**
 * Email-magic-link authentication.
 *
 * The project previously had no accounts at all — a founder was identified by
 * an anonymous signed cookie (see lib/owner.ts). That is still the primary
 * identity for project writes. This module adds the layer on top that a
 * referral program needs: a real email address attached to a durable account,
 * so a referral can be credited to the right person across browsers and days.
 *
 * The flow:
 *
 *   user submits email        → POST /api/auth/request
 *   we create/load the user   → users table, one row per email
 *   we mint a short-lived token → auth_tokens, stored as a SHA-256 hash
 *   user clicks the emailed link → /auth/confirm?token=...
 *   the token is consumed once → session cookie `ll_session` is set
 *
 * The session cookie is HMAC-signed, so a visitor cannot mint one for someone
 * else's account. The magic-link token is single-use, hashes the raw value,
 * and expires — a leaked confirmation URL is worthless within fifteen minutes
 * and worthless twice.
 *
 * Email is sent through Resend when RESEND_API_KEY is configured. Without a
 * provider the link is logged server-side, and only returned to the client on
 * non-production deployments so the flow can be demoed before email is wired
 * up. Requesting a link never reveals whether an address has an account
 * (always the same response), so the endpoint cannot be used to enumerate
 * signups.
 */

const SESSION_COOKIE = 'll_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type User = {
  id: string;
  email: string;
  referral_code: string;
  created_at: string;
};

/**
 * The signing secret for session cookies. AUTH_SECRET is the dedicated knob;
 * OWNER_SECRET is accepted as a fallback so a deployment that already opted
 * into ownership works for accounts without a second variable.
 */
function sessionSecret(): string | null {
  const value = process.env.AUTH_SECRET || process.env.OWNER_SECRET;
  return value && value.length >= 16 ? value : null;
}

/** True when sessions can be minted at all. */
export function isAuthEnabled(): boolean {
  return sessionSecret() !== null;
}

function sign(value: string, key: string): string {
  return createHmac('sha256', key).update(value).digest('base64url');
}

/** Verifies in constant time, so a mismatch leaks nothing about the signature. */
function verify(value: string, key: string): string | null {
  const at = value.lastIndexOf('.');
  if (at <= 0) return null;
  const id = value.slice(0, at);
  const given = Buffer.from(value.slice(at + 1));
  const expected = Buffer.from(sign(id, key));
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? id : null;
}

function readSessionUserId(request: NextRequest): string | null {
  const key = sessionSecret();
  if (!key) return null;
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  return raw ? verify(raw, key) : null;
}

/** Sets a signed session cookie for the given user on an outgoing response. */
export function setSessionCookie(response: NextResponse, userId: string): void {
  const key = sessionSecret();
  if (!key) return;
  const value = `${userId}.${sign(userId, key)}`;
  response.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Clears the session cookie on an outgoing response. */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/** The logged-in user for a route-handler request, or null. */
export async function getSessionUser(
  request: NextRequest
): Promise<User | null> {
  const userId = readSessionUserId(request);
  if (!userId) return null;
  try {
    const rows = await db<User>`
      SELECT id, email, referral_code, created_at FROM users WHERE id = ${userId}
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** The logged-in user for a server component, or null. Requires a DB call. */
export async function getSessionUserFromCookies(): Promise<User | null> {
  if (typeof window !== 'undefined') return null;
  const key = sessionSecret();
  if (!key) return null;
  try {
    const store = await cookies();
    const raw = store.get(SESSION_COOKIE)?.value;
    if (!raw) return null;
    const userId = verify(raw, key);
    if (!userId) return null;
    const rows = await db<User>`
      SELECT id, email, referral_code, created_at FROM users WHERE id = ${userId}
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export function isValidEmail(email: string): boolean {
  return EMAIL.test(email);
}

/** Masks an address for public display: a•••@example.com. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '•••';
  const head = user.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

/**
 * Unambiguous alphabet: no 0/O, 1/I, so a code read off a screen or a QR
 * cannot be mistyped silently.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateReferralCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < bytes.length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/** Normalizes a code someone typed: strips separators, uppercases. */
export function normalizeReferralCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** Finds a user by their referral code. */
export async function findUserByReferralCode(
  code: string
): Promise<User | null> {
  const rows = await db<User>`
    SELECT id, email, referral_code, created_at FROM users WHERE referral_code = ${code}
  `;
  return rows[0] ?? null;
}

/** Loads or creates a user for an address, minting a referral code on first run. */
export async function findOrCreateUser(email: string): Promise<User> {
  const existing = await db<User>`
    SELECT id, email, referral_code, created_at FROM users WHERE email = ${email}
  `;
  if (existing[0]) return existing[0];

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateReferralCode();
    try {
      const created = await db<User>`
        INSERT INTO users (id, email, referral_code, created_at)
        VALUES (${crypto.randomUUID()}, ${email}, ${code}, NOW())
        ON CONFLICT (email) DO NOTHING
        RETURNING id, email, referral_code, created_at
      `;
      if (created[0]) return created[0];
      const again = await db<User>`
        SELECT id, email, referral_code, created_at FROM users WHERE email = ${email}
      `;
      if (again[0]) return again[0];
    } catch {
      // A colliding referral code fails the INSERT; loop and mint another.
    }
  }
  throw new Error('Could not create an account for that address.');
}

/**
 * Mints a single-use magic link for a user. Returns the raw token to embed in
 * the email; only its SHA-256 hash is stored.
 */
export async function createMagicToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + TOKEN_MAX_AGE_MS);
  await db`
    INSERT INTO auth_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (${crypto.randomUUID()}, ${userId}, ${hash}, ${expiresAt.toISOString()}, NOW())
  `;
  return raw;
}

/** Consumes a magic-link token. Returns the user id, or null if invalid. */
export async function consumeMagicToken(raw: string): Promise<string | null> {
  if (!raw || raw.length < 20) return null;
  const hash = createHash('sha256').update(raw).digest('hex');
  const rows = await db<{ id: string; user_id: string; expires_at: string }>`
    SELECT id, user_id, expires_at FROM auth_tokens
    WHERE token_hash = ${hash} AND used_at IS NULL
  `;
  const token = rows[0];
  if (!token) return null;
  if (new Date(token.expires_at).getTime() < Date.now()) return null;

  const consumed = await db<{ user_id: string }>`
    UPDATE auth_tokens SET used_at = NOW()
    WHERE id = ${token.id} AND used_at IS NULL
    RETURNING user_id
  `;
  return consumed[0]?.user_id ?? null;
}

export type SendResult = { delivered: boolean; devLink?: string };

/**
 * Emails the magic link. With RESEND_API_KEY the email really goes out; without
 * one the link is logged server-side and returned only on non-production so a
 * local demo can still complete the flow.
 */
export async function sendMagicLinkEmail(
  email: string,
  url: string
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'LaunchLoop AI <onboarding@resend.dev>';

  if (key) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'Your LaunchLoop sign-in link',
          html: `<p>Sign in to LaunchLoop with this link — it expires in 15 minutes and works once:</p><p><a href="${url}">${url}</a></p><p>If you did not request this, you can ignore it.</p>`,
          text: `Sign in to LaunchLoop with this link — it expires in 15 minutes and works once:\n\n${url}\n\nIf you did not request this, you can ignore it.`,
        }),
      });
      if (!res.ok) {
        console.error('[AUTH] Resend rejected the email:', res.status, await res.text());
      } else {
        return { delivered: true };
      }
    } catch (err) {
      console.error('[AUTH] Failed to send email:', err);
    }
  }

  // No provider (or a failed send): surface the link only where it is safe.
  const isDev =
    process.env.NODE_ENV !== 'production' ||
    (process.env.NEXT_PUBLIC_APP_URL ?? '').includes('localhost');
  console.log(`[AUTH] Magic link for ${email}: ${url}`);
  if (isDev) return { delivered: false, devLink: url };
  return { delivered: false };
}
