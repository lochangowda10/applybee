/**
 * Removes synthetic signups from the willingness-to-pay counter.
 *
 * That counter is quoted as "real people put their email down", so a test
 * address sitting in it makes the number a lie — the same class of problem
 * as a fake button or a false success message. Load testing the /api/interest
 * rate limit writes rows; this deletes exactly those and nothing else.
 *
 * Scoped on purpose: only addresses at example.com and example.org, which
 * RFC 2606 reserves for documentation and testing and which therefore cannot
 * belong to a real person. Prints every row before and after.
 *
 *   node scripts/clean-test-intents.mjs          # dry run, shows what matches
 *   node scripts/clean-test-intents.mjs --delete # actually removes them
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url =
  process.env.DATABASE_URL ||
  /^DATABASE_URL=(.*)$/m
    .exec(readFileSync('.env.local', 'utf8'))?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, '');

if (!url) {
  console.error('No DATABASE_URL in the environment or .env.local.');
  process.exit(1);
}

const sql = neon(url);
const RESERVED = /@example\.(com|org)$/i;

const all = await sql`SELECT id, email, plan, created_at FROM purchase_intents ORDER BY created_at`;
const doomed = all.filter((r) => RESERVED.test(r.email));

console.log(`${all.length} recorded intents, ${doomed.length} of them synthetic:`);
for (const r of doomed) {
  console.log(`  ${r.created_at.toISOString()}  ${r.plan}  ${r.email}`);
}

if (doomed.length === 0) {
  console.log('Nothing to remove — the counter is clean.');
  process.exit(0);
}

if (!process.argv.includes('--delete')) {
  console.log('\nDry run. Re-run with --delete to remove these.');
  process.exit(0);
}

const removed = await sql`
  DELETE FROM purchase_intents WHERE id = ANY(${doomed.map((r) => r.id)}) RETURNING email
`;
const left = await sql`SELECT COUNT(*)::int AS n FROM purchase_intents`;
console.log(`\nRemoved ${removed.length}. ${left[0].n} real intents remain.`);
