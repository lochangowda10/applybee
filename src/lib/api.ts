import { NextRequest, NextResponse } from 'next/server';

/**
 * Shared request/response helpers for the API routes.
 *
 * Two problems this fixes across every route:
 *
 * 1. `await request.json()` throws on an empty or malformed body, which the
 *    routes' catch blocks turned into a 500 carrying the raw parser message
 *    ("Unexpected end of JSON input"). That is a client error and should read
 *    as one.
 * 2. Catch blocks returned `error.message` straight to the browser, so an
 *    internal failure could leak a connection string hint or a provider's raw
 *    payload. Detail belongs in the logs, not the response.
 */

/** Thrown for anything the caller got wrong; carries the status to return. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number = 400
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Reads a JSON body, rejecting an absent or malformed one as a 400. */
export async function readJsonBody<T = Record<string, unknown>>(
  request: NextRequest
): Promise<T> {
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new ApiError('Could not read the request body.', 400);
  }
  if (!raw.trim()) {
    throw new ApiError('A JSON body is required.', 400);
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError('Request body must be a JSON object.', 400);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Request body is not valid JSON.', 400);
  }
}

/**
 * Turns a thrown value into a response. An ApiError is the caller's fault and
 * its message is safe to return; anything else is ours, so it is logged in
 * full and answered with a generic sentence.
 */
export function apiError(scope: string, error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`[${scope}] Unhandled error:`, error);
  return NextResponse.json(
    { error: 'Something went wrong on our side. Please try again.' },
    { status: 500 }
  );
}

/** Parses stored JSON, converting a corrupt row into a clear server error. */
export function parseStoredJson<T>(value: string, what: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new ApiError(`Stored ${what} is unreadable.`, 500);
  }
}

/** Trims and length-caps a string field, rejecting empties when required. */
export function readString(
  value: unknown,
  field: string,
  { max = 2000, required = true }: { max?: number; required?: boolean } = {}
): string {
  if (typeof value !== 'string') {
    if (required) throw new ApiError(`${field} is required.`, 400);
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed && required) throw new ApiError(`${field} cannot be empty.`, 400);
  return trimmed.slice(0, max);
}
