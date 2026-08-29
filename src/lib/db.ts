import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || '';

let _sql: ReturnType<typeof neon> | null = null;

function getRawSql() {
  if (!_sql) {
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL not configured. Set it in your environment variables.');
    }
    _sql = neon(DATABASE_URL);
  }
  return _sql;
}

/**
 * Typed query helper — wraps neon's tagged template and always returns a typed array.
 * Usage: await db<T>`SELECT * FROM users WHERE id = ${userId}`
 */
export async function db<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const sql = getRawSql();
  // neon() returns a NeonQueryPromise; awaiting it gives rows as Record[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await sql(strings, ...values);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) return (result as { rows: T[] }).rows;
  return [];
}

/**
 * Execute raw SQL using tagged template syntax (for DDL / schema init).
 * Usage: await sqlExec`CREATE TABLE IF NOT EXISTS ...`
 */
export async function sqlExec(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<void> {
  const sql = getRawSql();
  await sql(strings, ...values);
}
