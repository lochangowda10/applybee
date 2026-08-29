import { sqlExec } from './db';

let initialized = false;

/**
 * Ensures database tables exist. Runs CREATE TABLE IF NOT EXISTS for each table.
 * Safe to call multiple times — only creates tables if they don't exist.
 */
export async function ensureSchema(): Promise<void> {
  if (initialized) return;

  try {
    await sqlExec`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo_url TEXT,
        product_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sqlExec`
      CREATE TABLE IF NOT EXISTS product_analyses (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        analysis_json TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sqlExec`
      CREATE TABLE IF NOT EXISTS founder_contexts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        target_user TEXT,
        alternative TEXT,
        differentiation TEXT,
        desired_action TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sqlExec`
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sqlExec`
      CREATE TABLE IF NOT EXISTS variants (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        name TEXT NOT NULL,
        positioning_json TEXT NOT NULL,
        landing_content_json TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sqlExec`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        variant_id TEXT NOT NULL REFERENCES variants(id),
        event_type TEXT NOT NULL,
        session_id TEXT,
        metadata TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sqlExec`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        variant_id TEXT NOT NULL REFERENCES variants(id),
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sqlExec`
      CREATE TABLE IF NOT EXISTS experiment_learnings (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        analysis_json TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sqlExec`
      CREATE TABLE IF NOT EXISTS iterations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        parent_experiment_id TEXT REFERENCES experiments(id),
        content_json TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    initialized = true;
    console.log('[DB] Schema initialized successfully');
  } catch (error) {
    console.error('[DB] Schema initialization failed:', error);
    throw error;
  }
}
