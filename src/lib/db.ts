import Database from 'better-sqlite3';
import path from 'path';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = path.join(process.cwd(), 'launchloop.db');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initializeDb(_db);
  }
  return _db;
}

function initializeDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_url TEXT,
      product_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_analyses (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS founder_contexts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      target_user TEXT,
      alternative TEXT,
      differentiation TEXT,
      desired_action TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS variants (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      name TEXT NOT NULL,
      positioning_json TEXT NOT NULL,
      landing_content_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (experiment_id) REFERENCES experiments(id)
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      session_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (experiment_id) REFERENCES experiments(id),
      FOREIGN KEY (variant_id) REFERENCES variants(id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (experiment_id) REFERENCES experiments(id),
      FOREIGN KEY (variant_id) REFERENCES variants(id)
    );

    CREATE TABLE IF NOT EXISTS experiment_learnings (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (experiment_id) REFERENCES experiments(id)
    );

    CREATE TABLE IF NOT EXISTS iterations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_experiment_id TEXT,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
  `);
}

// Helper types
export interface Project {
  id: string;
  name: string;
  repo_url: string | null;
  product_url: string | null;
  created_at: string;
}

export interface ProductAnalysis {
  id: string;
  project_id: string;
  analysis_json: string;
  created_at: string;
}

export interface FounderContext {
  id: string;
  project_id: string;
  target_user: string | null;
  alternative: string | null;
  differentiation: string | null;
  desired_action: string | null;
  created_at: string;
}

export interface Experiment {
  id: string;
  project_id: string;
  status: string;
  created_at: string;
}

export interface Variant {
  id: string;
  experiment_id: string;
  name: string;
  positioning_json: string;
  landing_content_json: string;
  created_at: string;
}

export interface AnalyticsEvent {
  id: string;
  experiment_id: string;
  variant_id: string;
  event_type: string;
  session_id: string | null;
  metadata: string | null;
  created_at: string;
}

export interface FeedbackEntry {
  id: string;
  experiment_id: string;
  variant_id: string;
  text: string;
  created_at: string;
}

export interface ExperimentLearning {
  id: string;
  experiment_id: string;
  analysis_json: string;
  created_at: string;
}
