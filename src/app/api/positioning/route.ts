import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { generatePositioning, generateLandingContent } from '@/lib/ai/analysis';
import { ApiError, apiError, parseStoredJson, readJsonBody, readString } from '@/lib/api';
import { readOwnerId, canModify } from '@/lib/owner';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    await initDB();

    // Two AI calls per request; owner-gated below, but the limiter runs first
    // so a leaked project link cannot be used to burn tokens.
    const rl = await rateLimit(`positioning:${clientIp(request)}`, 30, 3600);
    if (rl.limited) return rl.response;

    const projectId = readString(body.projectId, 'Project ID', { max: 100 });

    // Generating and deploying pages spends real money and puts URLs in front
    // of strangers, so it is restricted to whoever started the project.
    const owner = await db<{ owner_id: string | null }>`SELECT owner_id FROM projects WHERE id = ${projectId}`;
    if (owner.length === 0) {
      throw new ApiError('Project not found.', 404);
    }
    if (!canModify(owner[0].owner_id, readOwnerId(request))) {
      throw new ApiError(
        'This project was created in a different browser. Open it from the browser you started it in.',
        403
      );
    }

    const analysisRows = await db<{ analysis_json: string }>`SELECT analysis_json FROM product_analyses WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1`;
    if (analysisRows.length === 0) {
      throw new ApiError('No analysis found for this project.', 404);
    }

    const contextRows = await db<{ target_user: string | null; alternative: string | null; differentiation: string | null; desired_action: string | null }>`SELECT * FROM founder_contexts WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1`;
    const contextRow = contextRows[0];

    const analysis = parseStoredJson<Parameters<typeof generatePositioning>[0]>(
      analysisRows[0].analysis_json,
      'analysis'
    );

    const hypotheses = await generatePositioning(analysis, {
      target_user: contextRow?.target_user || undefined,
      alternative: contextRow?.alternative || undefined,
      differentiation: contextRow?.differentiation || undefined,
      desired_action: contextRow?.desired_action || undefined,
    });

    const experimentId = crypto.randomUUID();
    await db`INSERT INTO experiments (id, project_id, status, created_at) VALUES (${experimentId}, ${projectId}, 'active', NOW())`;

    for (const hypothesis of hypotheses) {
      const variantId = crypto.randomUUID();
      const landingContent = await generateLandingContent(hypothesis, analysis);
      await db`INSERT INTO variants (id, experiment_id, name, positioning_json, landing_content_json, created_at) VALUES (${variantId}, ${experimentId}, ${hypothesis.id}, ${JSON.stringify(hypothesis)}, ${JSON.stringify(landingContent)}, NOW())`;
    }

    const fullVariants = await db<{ id: string; name: string; positioning_json: string; landing_content_json: string }>`SELECT id, name, positioning_json, landing_content_json FROM variants WHERE experiment_id = ${experimentId}`;

    return NextResponse.json({
      experimentId,
      variants: fullVariants.map(v => ({
        id: v.id,
        name: v.name,
        positioning: parseStoredJson(v.positioning_json, 'positioning'),
        landingContent: parseStoredJson(v.landing_content_json, 'landing content'),
      })),
    });
  } catch (error: unknown) {
    return apiError('POSITIONING', error);
  }
}
