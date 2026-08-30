import { sqlQuery, sqlTransaction } from './db';

/**
 * Cached in-flight promise, not a boolean. Two concurrent requests hitting the
 * same warm serverless instance would otherwise both start the DDL; running
 * CREATE TABLE concurrently in Postgres can fail on pg_type's unique index.
 * Sharing one promise makes schema init happen exactly once per instance.
 */
let schemaPromise: Promise<void> | null = null;

function ddl(): unknown[] {
  return [
    sqlQuery`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo_url TEXT,
        product_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sqlQuery`
      CREATE TABLE IF NOT EXISTS product_analyses (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        analysis_json TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sqlQuery`
      CREATE TABLE IF NOT EXISTS founder_contexts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        target_user TEXT,
        alternative TEXT,
        differentiation TEXT,
        desired_action TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sqlQuery`
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sqlQuery`
      CREATE TABLE IF NOT EXISTS variants (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        name TEXT NOT NULL,
        positioning_json TEXT NOT NULL,
        landing_content_json TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sqlQuery`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        variant_id TEXT NOT NULL REFERENCES variants(id),
        event_type TEXT NOT NULL,
        session_id TEXT,
        metadata TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sqlQuery`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        variant_id TEXT NOT NULL REFERENCES variants(id),
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sqlQuery`
      CREATE TABLE IF NOT EXISTS experiment_learnings (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        analysis_json TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sqlQuery`
      CREATE TABLE IF NOT EXISTS iterations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        parent_experiment_id TEXT REFERENCES experiments(id),
        content_json TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sqlQuery`
      CREATE TABLE IF NOT EXISTS referrals (
        id TEXT PRIMARY KEY,
        referrer_experiment_id TEXT REFERENCES experiments(id),
        referrer_variant_id TEXT REFERENCES variants(id),
        referred_project_id TEXT NOT NULL REFERENCES projects(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    /**
     * Recorded intent to buy a paid plan. Deliberately NOT a payment: nobody
     * is charged, and every surface that shows this number says so. It exists
     * because "would anyone pay for this" is a question worth answering with
     * a count of real people rather than with an argument.
     *
     * The unique index makes a repeated submission idempotent, so the number
     * cannot be inflated by someone submitting the same address twice.
     */
    sqlQuery`
      CREATE TABLE IF NOT EXISTS purchase_intents (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        plan TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    sqlQuery`CREATE UNIQUE INDEX IF NOT EXISTS idx_intents_email_plan ON purchase_intents (email, plan)`,
    /**
     * Email accounts for the magic-link auth layer. One row per address; the
     * referral_code is what a founder shares to credit their referrals.
     */
    sqlQuery`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        referral_code TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    /**
     * Single-use magic links. Only the SHA-256 hash of the token is stored, so
     * a leaked copy of this table cannot be replayed into a session. See
     * lib/auth.ts for the consume path.
     */
    sqlQuery`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
    /**
     * Account-level referral claims. Distinct from the passive `referrals`
     * table: that one records which generated page a project arrived through,
     * this one records a person explicitly claiming another person's referral
     * code. The unique pair keeps a claim idempotent, so two founders cannot
     * both take credit for the same invitation.
     */
    sqlQuery`
      CREATE TABLE IF NOT EXISTS referral_claims (
        id TEXT PRIMARY KEY,
        referrer_user_id TEXT NOT NULL REFERENCES users(id),
        claimer_user_id TEXT NOT NULL REFERENCES users(id),
        claimed_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (referrer_user_id, claimer_user_id)
      )
    `,
    /**
     * Fixed-window rate-limit buckets. One row per (key, window) rather than
     * one row per hit, so the table stays small and the check stays a single
     * upsert. See lib/rate-limit.ts for the fail-open rationale.
     */
    sqlQuery`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT NOT NULL,
        window_start TIMESTAMPTZ NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (key, window_start)
      )
    `,
    /**
     * Ownership, added after the fact. ALTER ... IF NOT EXISTS keeps this
     * idempotent alongside the CREATEs above, and the column is nullable on
     * purpose: rows that predate ownership stay unclaimed and writable rather
     * than becoming read-only the moment this ships.
     */
    sqlQuery`ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id TEXT`,
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects (owner_id)`,
    // Projects may now be attached to an account, so a founder's dashboard can
    // list everything they created across browsers.
    sqlQuery`ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id TEXT`,
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_projects_user ON projects (user_id)`,
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_tokens_user ON auth_tokens (user_id)`,
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_claims_referrer ON referral_claims (referrer_user_id)`,
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_claims_claimer ON referral_claims (claimer_user_id)`,
    // Indexes on every foreign key the read paths filter by. Without these the
    // dashboard scans the whole events table on each load.
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_analytics_experiment ON analytics_events (experiment_id)`,
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_feedback_experiment ON feedback (experiment_id)`,
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_variants_experiment ON variants (experiment_id)`,
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_analyses_project ON product_analyses (project_id)`,
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_referrals_variant ON referrals (referrer_variant_id)`,
    sqlQuery`CREATE INDEX IF NOT EXISTS idx_referrals_project ON referrals (referred_project_id)`,
  ];
}

/**
 * Ensures database tables exist. Idempotent, and sent as one transaction so a
 * cold start costs a single HTTP round trip rather than one per statement.
 */
export async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = sqlTransaction(ddl())
      .then(() => {
        console.log('[DB] Schema ready');
      })
      .catch((error) => {
        // Clear the cache so a later request can retry rather than being stuck
        // with a permanently rejected promise.
        schemaPromise = null;
        console.error('[DB] Schema initialization failed:', error);
        throw error;
      });
  }
  return schemaPromise;
}
