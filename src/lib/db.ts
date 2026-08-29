import { neon } from '@neondatabase/serverless';

/**
 * Data layer — Neon Postgres over HTTP.
 *
 * Neon's HTTP driver is stateless and connectionless, so it works inside
 * Vercel's serverless functions where a local filesystem DB cannot: every
 * invocation talks to the same hosted Postgres, and writes survive between
 * requests.
 *
 * The connection string is read lazily so that importing this module during
 * `next build` (where DATABASE_URL may be absent) never throws.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawSql = any;

let _sql: RawSql = null;

/** True when a database connection string is present. Lets callers degrade gracefully. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getRawSql(): RawSql {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is not configured. Set it in your Vercel project environment variables.'
      );
    }
    _sql = neon(url);
  }
  return _sql;
}

/**
 * Typed query helper — wraps neon's tagged template and always returns a typed array.
 * Values are sent as bound parameters, never interpolated into SQL text.
 *
 * Usage: await db<Row>`SELECT * FROM users WHERE id = ${userId}`
 */
export async function db<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const sql = getRawSql();
  const result = await sql(strings, ...values);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/**
 * Execute a single statement (used for DDL and writes where no rows are needed).
 * Usage: await sqlExec`CREATE TABLE IF NOT EXISTS ...`
 */
export async function sqlExec(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<void> {
  const sql = getRawSql();
  await sql(strings, ...values);
}

/**
 * Build an unexecuted query for `sqlTransaction`. Neon's query objects are lazy —
 * they only hit the network when awaited — so these can be collected and sent
 * together.
 */
export function sqlQuery(strings: TemplateStringsArray, ...values: unknown[]): unknown {
  const sql = getRawSql();
  return sql(strings, ...values);
}

/**
 * Run several statements as a single non-interactive transaction over one HTTP
 * round trip. Used by schema init so a cold start costs one request, not nine.
 */
export async function sqlTransaction(queries: unknown[]): Promise<void> {
  const sql = getRawSql();
  await sql.transaction(queries);
}
