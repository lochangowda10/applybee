import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';

/**
 * Rehydrates a project from the database.
 *
 * The project page previously restored itself from sessionStorage alone, so a
 * refresh, a new tab, or a link handed to someone else lost the whole run and
 * left the user on a progress animation that never finished. Everything the
 * page needs is already persisted; this hands it back.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await initDB();
    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    const projects = await db<{
      id: string;
      name: string;
      repo_url: string | null;
      product_url: string | null;
    }>`SELECT id, name, repo_url, product_url FROM projects WHERE id = ${projectId}`;

    if (projects.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const analysisRows = await db<{ analysis_json: string }>`
      SELECT analysis_json FROM product_analyses
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (analysisRows.length === 0) {
      return NextResponse.json({ error: 'No analysis found for project' }, { status: 404 });
    }

    let analysis: unknown;
    try {
      analysis = JSON.parse(analysisRows[0].analysis_json);
    } catch {
      return NextResponse.json({ error: 'Stored analysis is unreadable' }, { status: 500 });
    }

    // Founder context, so the questionnaire is not asked twice.
    const contextRows = await db<{
      target_user: string | null;
      alternative: string | null;
      differentiation: string | null;
      desired_action: string | null;
    }>`
      SELECT target_user, alternative, differentiation, desired_action
      FROM founder_contexts WHERE project_id = ${projectId}
      ORDER BY created_at DESC LIMIT 1
    `;

    // Most recent experiment and its variants, if the run got that far.
    const experimentRows = await db<{ id: string }>`
      SELECT id FROM experiments WHERE project_id = ${projectId}
      ORDER BY created_at DESC LIMIT 1
    `;

    let experimentId: string | null = null;
    const variants: {
      id: string;
      name: string;
      positioning: unknown;
      landingContent: unknown;
    }[] = [];

    if (experimentRows.length > 0) {
      experimentId = experimentRows[0].id;
      const variantRows = await db<{
        id: string;
        name: string;
        positioning_json: string;
        landing_content_json: string;
      }>`
        SELECT id, name, positioning_json, landing_content_json
        FROM variants WHERE experiment_id = ${experimentId}
        ORDER BY name
      `;
      // Skip any row whose JSON is corrupt rather than failing the whole resume.
      for (const v of variantRows) {
        try {
          variants.push({
            id: v.id,
            name: v.name,
            positioning: JSON.parse(v.positioning_json),
            landingContent: JSON.parse(v.landing_content_json),
          });
        } catch {
          console.error(`[PROJECT] Skipping variant ${v.id}: unreadable JSON`);
        }
      }
      if (variants.length === 0) experimentId = null;
    }

    return NextResponse.json({
      projectId,
      project: projects[0],
      analysis,
      context: contextRows[0] ?? null,
      experimentId,
      variants,
    });
  } catch (error: unknown) {
    console.error('[PROJECT] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load project';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
