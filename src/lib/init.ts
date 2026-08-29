import { ensureSchema } from './db-schema';

let _ensured = false;

/**
 * Ensures DB schema is initialized before the first query.
 * Caches so it only runs once per serverless instance.
 */
export async function initDB(): Promise<void> {
  if (_ensured) return;
  await ensureSchema();
  _ensured = true;
}
