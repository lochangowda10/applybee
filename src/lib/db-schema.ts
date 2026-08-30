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
