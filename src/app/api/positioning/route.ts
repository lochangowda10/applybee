import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { generatePositioning, generateLandingContent } from '@/lib/ai/analysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    const db = getDb();

    // Get project analysis
    const analysisRow = db.prepare(
      'SELECT analysis_json FROM product_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(projectId) as { analysis_json: string } | undefined;

    if (!analysisRow) {
      return NextResponse.json({ error: 'No analysis found for project' }, { status: 404 });
    }

    // Get founder context
    const contextRow = db.prepare(
      'SELECT * FROM founder_contexts WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(projectId) as {
      target_user: string | null;
      alternative: string | null;
      differentiation: string | null;
      desired_action: string | null;
    } | undefined;

    const analysis = JSON.parse(analysisRow.analysis_json);

    // Generate positioning hypotheses
    const hypotheses = await generatePositioning(analysis, {
      target_user: contextRow?.target_user || undefined,
      alternative: contextRow?.alternative || undefined,
      differentiation: contextRow?.differentiation || undefined,
      desired_action: contextRow?.desired_action || undefined,
    });

    // Create experiment
    const experimentId = uuid();
    db.prepare('INSERT INTO experiments (id, project_id, status, created_at) VALUES (?, ?, ?, datetime("now"))')
      .run(experimentId, projectId, 'active');

    // Generate landing content for each variant
    for (const hypothesis of hypotheses) {
      const variantId = uuid();
      const landingContent = await generateLandingContent(hypothesis, analysis);

      db.prepare(`
        INSERT INTO variants (id, experiment_id, name, positioning_json, landing_content_json, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(variantId, experimentId, hypothesis.id, JSON.stringify(hypothesis), JSON.stringify(landingContent));
    }

    // Return experiment with variants
    const variants = db.prepare(
      'SELECT * FROM variants WHERE experiment_id = ?'
    ).all(experimentId) as { id: string; name: string; positioning_json: string; landing_content_json: string }[];

    return NextResponse.json({
      experimentId,
      variants: variants.map(v => ({
        id: v.id,
        name: v.name,
        positioning: JSON.parse(v.positioning_json),
        landingContent: JSON.parse(v.landing_content_json),
      })),
    });
  } catch (error: unknown) {
    console.error('Positioning error:', error);
    const message = error instanceof Error ? error.message : 'Positioning generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
