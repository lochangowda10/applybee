import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { db } from '@/lib/db';
import { generatePositioning, generateLandingContent } from '@/lib/ai/analysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    const analysisRows = await db<{ analysis_json: string }>`SELECT analysis_json FROM product_analyses WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1`;
    if (analysisRows.length === 0) {
      return NextResponse.json({ error: 'No analysis found for project' }, { status: 404 });
    }

    const contextRows = await db<{ target_user: string | null; alternative: string | null; differentiation: string | null; desired_action: string | null }>`SELECT * FROM founder_contexts WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1`;
    const contextRow = contextRows[0];

    const analysis = JSON.parse(analysisRows[0].analysis_json);

    const hypotheses = await generatePositioning(analysis, {
      target_user: contextRow?.target_user || undefined,
      alternative: contextRow?.alternative || undefined,
      differentiation: contextRow?.differentiation || undefined,
      desired_action: contextRow?.desired_action || undefined,
    });

    const experimentId = uuid();
    await db`INSERT INTO experiments (id, project_id, status, created_at) VALUES (${experimentId}, ${projectId}, 'active', NOW())`;

    for (const hypothesis of hypotheses) {
      const variantId = uuid();
      const landingContent = await generateLandingContent(hypothesis, analysis);
      await db`INSERT INTO variants (id, experiment_id, name, positioning_json, landing_content_json, created_at) VALUES (${variantId}, ${experimentId}, ${hypothesis.id}, ${JSON.stringify(hypothesis)}, ${JSON.stringify(landingContent)}, NOW())`;
    }

    const fullVariants = await db<{ id: string; name: string; positioning_json: string; landing_content_json: string }>`SELECT id, name, positioning_json, landing_content_json FROM variants WHERE experiment_id = ${experimentId}`;

    return NextResponse.json({
      experimentId,
      variants: fullVariants.map(v => ({
        id: v.id,
        name: v.name,
        positioning: JSON.parse(v.positioning_json),
        landingContent: JSON.parse(v.landing_content_json),
      })),
    });
  } catch (error: unknown) {
    console.error('[POSITIONING] Error:', error);
    const message = error instanceof Error ? error.message : 'Positioning generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
