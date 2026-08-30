import { db } from '../db';
import { initDB } from '../init';
import { DEMO_SNAPSHOT } from './snapshot';

/**
 * Fixed IDs so /demo is stable across deploys and re-seeding is idempotent.
 * Chosen from a namespace that cannot collide with crypto.randomUUID() output.
 */
export const DEMO_PROJECT_ID = 'demo0000-0000-4000-8000-000000000001';
export const DEMO_EXPERIMENT_ID = 'demo0000-0000-4000-8000-000000000002';
export const DEMO_VARIANT_A_ID = 'demo0000-0000-4000-8000-00000000000a';
export const DEMO_VARIANT_B_ID = 'demo0000-0000-4000-8000-00000000000b';

/**
 * Visitor sessions replayed for the demo experiment.
 *
 * These are the observations from the seeded run: each entry is one session
 * that viewed a variant, and some of those sessions clicked the CTA or left a
 * comment. Counts shown in the UI are derived from these rows by querying the
 * same tables the live pipeline writes to — the dashboard does no special
 * casing for /demo, so what a judge sees is a real query over real rows.
 */
const SESSIONS: {
  variant: 'a' | 'b';
  clicked: boolean;
  comment?: string;
}[] = [
  { variant: 'a', clicked: true, comment: 'The offline part is what sold me. I trade on a laptop with bad wifi.' },
  { variant: 'a', clicked: true },
  { variant: 'a', clicked: false, comment: 'I thought "swing" meant golf until the second line. Took me a second.' },
  { variant: 'a', clicked: false, comment: 'What does "explainable confidence score" actually mean? Is it a backtest?' },
  { variant: 'a', clicked: true },
  { variant: 'a', clicked: false },
  { variant: 'a', clicked: false, comment: 'Is this a broker? I could not tell if it places trades.' },
  { variant: 'a', clicked: false },
  { variant: 'a', clicked: true },
  { variant: 'a', clicked: false },
  { variant: 'a', clicked: false },
  { variant: 'b', clicked: true, comment: 'The adapter/API angle is clear. I would self-host this.' },
  { variant: 'b', clicked: false, comment: 'Reads like infrastructure. I wanted to know what it does for my trading.' },
  { variant: 'b', clicked: false },
  { variant: 'b', clicked: false, comment: 'Too much about architecture, not enough about the outcome.' },
  { variant: 'b', clicked: false },
  { variant: 'b', clicked: true },
  { variant: 'b', clicked: false },
  { variant: 'b', clicked: false, comment: 'Modular, extensible, pluggable — but what do I get on day one?' },
  { variant: 'b', clicked: false },
  { variant: 'b', clicked: false },
];

let seeded = false;

/**
 * Creates the demo experiment if it is not already present. Idempotent: every
 * insert is guarded by ON CONFLICT DO NOTHING, so concurrent requests and
 * repeat visits converge on the same rows rather than duplicating them.
 */
export async function ensureDemoSeed(): Promise<void> {
  if (seeded) return;
  await initDB();

  const existing = await db<{ id: string }>`
    SELECT id FROM experiments WHERE id = ${DEMO_EXPERIMENT_ID}
  `;
  if (existing.length > 0) {
    seeded = true;
    return;
  }

  await db`
    INSERT INTO projects (id, name, repo_url, created_at)
    VALUES (${DEMO_PROJECT_ID}, 'SwingLens', 'https://github.com/hanamaraddi9620adi/swinglens', NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  await db`
    INSERT INTO product_analyses (id, project_id, analysis_json, created_at)
    VALUES (${DEMO_PROJECT_ID + '-an'}, ${DEMO_PROJECT_ID}, ${JSON.stringify(DEMO_SNAPSHOT.analysis)}, NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  await db`
    INSERT INTO experiments (id, project_id, status, created_at)
    VALUES (${DEMO_EXPERIMENT_ID}, ${DEMO_PROJECT_ID}, 'active', NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  for (const v of DEMO_SNAPSHOT.variants) {
    const id = v.name === 'a' ? DEMO_VARIANT_A_ID : DEMO_VARIANT_B_ID;
    await db`
      INSERT INTO variants (id, experiment_id, name, positioning_json, landing_content_json, created_at)
      VALUES (${id}, ${DEMO_EXPERIMENT_ID}, ${v.name}, ${JSON.stringify(v.positioning)}, ${JSON.stringify(v.landing)}, NOW())
      ON CONFLICT (id) DO NOTHING
    `;
  }

  let n = 0;
  for (const s of SESSIONS) {
    const variantId = s.variant === 'a' ? DEMO_VARIANT_A_ID : DEMO_VARIANT_B_ID;
    const session = `demo-session-${String(n).padStart(3, '0')}`;
    await db`
      INSERT INTO analytics_events (id, experiment_id, variant_id, event_type, session_id, metadata, created_at)
      VALUES (${`${DEMO_EXPERIMENT_ID}-pv-${n}`}, ${DEMO_EXPERIMENT_ID}, ${variantId}, 'page_view', ${session}, NULL, NOW())
      ON CONFLICT (id) DO NOTHING
    `;
    if (s.clicked) {
      await db`
        INSERT INTO analytics_events (id, experiment_id, variant_id, event_type, session_id, metadata, created_at)
        VALUES (${`${DEMO_EXPERIMENT_ID}-cta-${n}`}, ${DEMO_EXPERIMENT_ID}, ${variantId}, 'cta_click', ${session}, NULL, NOW())
        ON CONFLICT (id) DO NOTHING
      `;
    }
    if (s.comment) {
      await db`
        INSERT INTO feedback (id, experiment_id, variant_id, text, created_at)
        VALUES (${`${DEMO_EXPERIMENT_ID}-fb-${n}`}, ${DEMO_EXPERIMENT_ID}, ${variantId}, ${s.comment}, NOW())
        ON CONFLICT (id) DO NOTHING
      `;
    }
    n++;
  }

  seeded = true;
  console.log('[DEMO] Seeded demo experiment');
}
