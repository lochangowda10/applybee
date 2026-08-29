import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { analyzeExperimentResults, type GrowthAnalysis } from '@/lib/ai/analysis';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    const { experimentId } = await params;
    const db = getDb();

    // Get experiment
    const experiment = db.prepare(
      'SELECT * FROM experiments WHERE id = ?'
    ).get(experimentId) as { id: string; project_id: string } | undefined;

    if (!experiment) {
      return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    }

    // Get analysis
    const analysisRow = db.prepare(
      'SELECT analysis_json FROM product_analyses WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(experiment.project_id) as { analysis_json: string } | undefined;

    if (!analysisRow) {
      return NextResponse.json({ error: 'No analysis found' }, { status: 404 });
    }

    const analysis = JSON.parse(analysisRow.analysis_json);

    // Get variant analytics
    const variants = db.prepare(
      'SELECT id, name FROM variants WHERE experiment_id = ?'
    ).all(experimentId) as { id: string; name: string }[];

    const variantData = await Promise.all(
      variants.map(async (v) => {
        const views = db.prepare(
          `SELECT COUNT(DISTINCT session_id) as count FROM analytics_events
           WHERE experiment_id = ? AND variant_id = ? AND event_type = 'page_view'`
        ).get(experimentId, v.id) as { count: number };

        const clicks = db.prepare(
          `SELECT COUNT(*) as count FROM analytics_events
           WHERE experiment_id = ? AND variant_id = ? AND event_type = 'cta_click'`
        ).get(experimentId, v.id) as { count: number };

        const feedbackEntries = db.prepare(
          `SELECT text FROM feedback WHERE experiment_id = ? AND variant_id = ?`
        ).all(experimentId, v.id) as { text: string }[];

        return {
          name: v.name,
          views: views.count,
          clicks: clicks.count,
          feedback: feedbackEntries.map(f => f.text),
        };
      })
    );

    const dataA = variantData.find(v => v.name === 'a') || { views: 0, clicks: 0, feedback: [] };
    const dataB = variantData.find(v => v.name === 'b') || { views: 0, clicks: 0, feedback: [] };

    // Run AI analysis
    const growthAnalysis = await analyzeExperimentResults(dataA, dataB, analysis);

    // Store learning
    db.prepare(`
      INSERT INTO experiment_learnings (id, experiment_id, analysis_json, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(uuid(), experimentId, JSON.stringify(growthAnalysis));

    return NextResponse.json({ analysis: growthAnalysis });
  } catch (error: unknown) {
    console.error('Learning error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate analysis';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    const { experimentId } = await params;
    const db = getDb();

    const learnings = db.prepare(
      'SELECT * FROM experiment_learnings WHERE experiment_id = ? ORDER BY created_at DESC'
    ).all(experimentId) as { id: string; analysis_json: string; created_at: string }[];

    return NextResponse.json({
      learnings: learnings.map((l) => ({
        id: l.id,
        analysis: JSON.parse(l.analysis_json),
        created_at: l.created_at,
      })),
    });
  } catch (error: unknown) {
    console.error('Learning fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch learnings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
