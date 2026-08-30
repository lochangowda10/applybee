import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { analyzeExperimentResults } from '@/lib/ai/analysis';
import { ApiError, apiError, parseStoredJson } from '@/lib/api';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    await initDB();
    const { experimentId } = await params;

    const experiments = await db<{ id: string; project_id: string }>`SELECT id, project_id FROM experiments WHERE id = ${experimentId}`;
    if (experiments.length === 0) {
      throw new ApiError('Experiment not found.', 404);
    }
    const experiment = experiments[0];

    const analysisRows = await db<{ analysis_json: string }>`SELECT analysis_json FROM product_analyses WHERE project_id = ${experiment.project_id} ORDER BY created_at DESC LIMIT 1`;
    if (analysisRows.length === 0) {
      throw new ApiError('No analysis found for this experiment.', 404);
    }
    const analysis = parseStoredJson<Parameters<typeof analyzeExperimentResults>[2]>(
      analysisRows[0].analysis_json,
      'analysis'
    );

    const variants = await db<{ id: string; name: string }>`SELECT id, name FROM variants WHERE experiment_id = ${experimentId}`;

    const variantData = await Promise.all(
      variants.map(async (v) => {
        const viewsRows = await db<{ count: string }>`SELECT COUNT(DISTINCT session_id) as count FROM analytics_events WHERE experiment_id = ${experimentId} AND variant_id = ${v.id} AND event_type = 'page_view'`;
        const clicksRows = await db<{ count: string }>`SELECT COUNT(*) as count FROM analytics_events WHERE experiment_id = ${experimentId} AND variant_id = ${v.id} AND event_type = 'cta_click'`;
        const feedbackEntries = await db<{ text: string }>`SELECT text FROM feedback WHERE experiment_id = ${experimentId} AND variant_id = ${v.id}`;

        return {
          name: v.name,
          views: parseInt(viewsRows[0]?.count || '0', 10),
          clicks: parseInt(clicksRows[0]?.count || '0', 10),
          feedback: feedbackEntries.map(f => f.text),
        };
      })
    );

    const dataA = variantData.find(v => v.name === 'a') || { views: 0, clicks: 0, feedback: [] };
    const dataB = variantData.find(v => v.name === 'b') || { views: 0, clicks: 0, feedback: [] };

    const growthAnalysis = await analyzeExperimentResults(dataA, dataB, analysis);

    await db`INSERT INTO experiment_learnings (id, experiment_id, analysis_json, created_at) VALUES (${crypto.randomUUID()}, ${experimentId}, ${JSON.stringify(growthAnalysis)}, NOW())`;
    await db`UPDATE experiments SET status = 'learned' WHERE id = ${experimentId}`;

    return NextResponse.json({ analysis: growthAnalysis });
  } catch (error: unknown) {
    return apiError('LEARNING', error);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    await initDB();
    const { experimentId } = await params;

    const learnings = await db<{ id: string; analysis_json: string; created_at: string }>`SELECT id, analysis_json, created_at FROM experiment_learnings WHERE experiment_id = ${experimentId} ORDER BY created_at DESC`;

    return NextResponse.json({
      learnings: learnings.map(l => ({
        id: l.id,
        analysis: parseStoredJson(l.analysis_json, 'learning'),
        created_at: l.created_at,
      })),
    });
  } catch (error: unknown) {
    return apiError('LEARNING:GET', error);
  }
}
