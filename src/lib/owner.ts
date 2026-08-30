import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * Anonymous project ownership.
 *
 * A founder pastes a repo and gets a dashboard. Asking them to create an
 * account before they have seen the product would cost more users than it
 * protects, so identity here is an anonymous id in a signed httpOnly cookie:
 * enough for the product to know whose project this is and refuse to let
 * anyone else change it, without a password anybody has to invent.
 *
 * What this is and is not:
 *
 * - It IS a real authorization boundary for founder-side writes. The id is
 *   HMAC-signed, so a visitor cannot mint one for someone else's project.
 * - It is NOT account authentication. It is scoped to one browser, and anyone
 *   holding a project URL can still *read* the dashboard. Read access is
 *   deliberately open: the whole point is that these links get shared.
 *
 * The whole mechanism is inert unless OWNER_SECRET is configured. Without it
 * every project is unclaimed and nothing is enforced — a deployment that has
 * not opted in behaves exactly as it did before ownership existed, rather
 * than locking people out of their own work because an env var is missing.
 */

const COOKIE = 'll_owner';
const MAX_AGE = 60 * 60 * 24 * 365;

function secret(): string | null {
  const value = process.env.OWNER_SECRET;
  return value && value.length >= 16 ? value : null;
}

/** True when this deployment has opted into ownership at all. */
export function isOwnershipEnabled(): boolean {
  return secret() !== null;
}

function sign(id: string, key: string): string {
  return createHmac('sha256', key).update(id).digest('base64url');
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

/** Reads the caller's owner id, or null if absent, unsigned, or disabled. */
export function readOwnerId(request: NextRequest): string | null {
  const key = secret();
  if (!key) return null;
  const raw = request.cookies.get(COOKIE)?.value;
  return raw ? verify(raw, key) : null;
}

/**
 * Returns the caller's owner id, minting one if they do not have it yet.
 * `setOn` must be called with the outgoing response to persist a new id.
 */
export function ensureOwnerId(request: NextRequest): {
  ownerId: string | null;
  setOn: (response: NextResponse) => void;
} {
  const key = secret();
  if (!key) return { ownerId: null, setOn: () => {} };

  const existing = readOwnerId(request);
  if (existing) return { ownerId: existing, setOn: () => {} };

  const ownerId = randomUUID();
  const value = `${ownerId}.${sign(ownerId, key)}`;
  return {
    ownerId,
    setOn: (response) => {
      response.cookies.set(COOKIE, value, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: MAX_AGE,
        secure: process.env.NODE_ENV === 'production',
      });
    },
  };
}

/**
 * Decides whether a caller may modify a project.
 *
 * Unclaimed projects stay writable. That covers the seeded demo, anything
 * created before ownership existed, and every deployment that has not set a
 * secret — none of which should suddenly become read-only.
 */
export function canModify(
  projectOwnerId: string | null,
  callerOwnerId: string | null
): boolean {
  if (!isOwnershipEnabled()) return true;
  if (!projectOwnerId) return true;
  return projectOwnerId === callerOwnerId;
}
