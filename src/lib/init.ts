import { ensureSchema } from './db-schema';

/**
 * Ensures DB schema is initialized before the first query.
 * `ensureSchema` already caches its in-flight promise, so this is safe and
 * cheap to call at the top of every route.
 */
export async function initDB(): Promise<void> {
  return ensureSchema();
}
