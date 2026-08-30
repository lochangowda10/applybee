import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import {
  generateV3,
  generateLandingContent,
  type GrowthAnalysis,
  type PositioningHypothesis,
  type ProductAnalysis,
} from '@/lib/ai/analysis';
import { ApiError, apiError, parseStoredJson } from '@/lib/api';
import { readOwnerId, canModify } from '@/lib/owner';

/**
 * Proposes and deploys V3 — the step that closes the loop.
 *
 * Split deliberately into two calls. POST proposes a revision and stores it
 * without deploying anything; POST with { approve: true } is the only path
 * that puts a page in front of a visitor. A tool that reads visitor responses
 * and silently rewrites the live page would be the version of this product
 * nobody should trust, so approval is a separate, explicit request.
 */

type Loaded = {
  projectId: string;
  ownerId: string | null;
  winner: PositioningHypothesis;
  winnerName: string;
  learning: GrowthAnalysis;
  analysis: ProductAnalysis;
  feedback: string[];
};

async function load(experimentId: string): Promise<Loaded> {
  const experiments = await db<{ id: string; project_id: string; owner_id: string | null }>`
    SELECT e.id, e.project_id, p.owner_id
    FROM experiments e JOIN projects p ON p.id = e.project_id
    WHERE e.id = ${experimentId}
  `;
  if (experiments.length === 0) throw new ApiError('Experiment not found.', 404);
  const projectId = experiments[0].project_id;
  const ownerId = experiments[0].owner_id;

  const learningRows = await db<{ analysis_json: string }>`
    SELECT analysis_json FROM experiment_learnings
    WHERE experiment_id = ${experimentId} ORDER BY created_at DESC LIMIT 1
  `;
  if (learningRows.length === 0) {
    throw new ApiError(
      'Run the results analysis first — V3 is built from what the visitors did.',
      409
    );
  }
  const learning = parseStoredJson<GrowthAnalysis>(learningRows[0].analysis_json, 'learning');

  const analysisRows = await db<{ analysis_json: string }>`
    SELECT analysis_json FROM product_analyses
    WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1
  `;
  if (analysisRows.length === 0) throw new ApiError('No analysis found for this project.', 404);
  const analysis = parseStoredJson<ProductAnalysis>(analysisRows[0].analysis_json, 'analysis');

  const variants = await db<{ name: string; positioning_json: string }>`
    SELECT name, positioning_json FROM variants WHERE experiment_id = ${experimentId}
  `;
  if (variants.length === 0) throw new ApiError('This experiment has no variants.', 404);

  // An inconclusive result still has a defensible starting point: revise the
  // version that was shown first rather than refusing to continue.
  const winnerName = learning.winner ?? variants[0].name;
  const winnerRow = variants.find((v) => v.name === winnerName) ?? variants[0];
  const winner = parseStoredJson<PositioningHypothesis>(
    winnerRow.positioning_json,
    'positioning'
  );

  const feedbackRows = await db<{ text: string }>`
    SELECT text FROM feedback WHERE experiment_id = ${experimentId} ORDER BY created_at DESC LIMIT 30
  `;

  return {
    projectId,
    ownerId,
    winner,
    winnerName: winnerRow.name,
    learning,
    analysis,
    feedback: feedbackRows.map((f) => f.text),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    // An empty body means "propose"; approval has to be asked for explicitly.
    let approve = false;
    const raw = await request.text();
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { approve?: unknown };
      approve = parsed?.approve === true;
    }
    await initDB();
    const { experimentId } = await params;

    const ctx = await load(experimentId);

    /**
     * Both proposing and approving are founder actions. Approving especially:
     * it deploys pages that strangers will see, and letting anyone holding the
     * link do that would make the approval gate decorative.
     */
    if (!canModify(ctx.ownerId, readOwnerId(request))) {
      throw new ApiError(
        'This project was created in a different browser. Open it from the browser you started it in.',
        403
      );
    }

    if (!approve) {
      const proposal = await generateV3(
        ctx.winner,
        ctx.learning,
        ctx.analysis,
        ctx.feedback
      );

      // Stored as a proposal. Nothing about this row is visible to a visitor.
      await db`
        INSERT INTO iterations (id, project_id, parent_experiment_id, content_json, created_at)
        VALUES (${crypto.randomUUID()}, ${ctx.projectId}, ${experimentId}, ${JSON.stringify(proposal)}, NOW())
      `;

      return NextResponse.json({
        approved: false,
        basedOnVariant: ctx.winnerName,
        sampleFeedbackCount: ctx.feedback.length,
        proposal,
      });
    }

    // ---- Approved: deploy V3 against the version it is replacing. ----
    const rows = await db<{ content_json: string }>`
      SELECT content_json FROM iterations
      WHERE parent_experiment_id = ${experimentId} ORDER BY created_at DESC LIMIT 1
    `;
    if (rows.length === 0) {
      throw new ApiError('There is no proposal to approve yet.', 409);
    }
    const proposal = parseStoredJson<{ positioning: PositioningHypothesis }>(
      rows[0].content_json,
      'proposal'
    );

    /**
     * V3 becomes variant A of a new experiment and the version it beat becomes
     * variant B. Deploying V3 on its own would produce a page with nothing to
     * compare it against, which is the failure mode this product exists to fix.
     */
    const nextExperimentId = crypto.randomUUID();
    await db`
      INSERT INTO experiments (id, project_id, status, created_at)
      VALUES (${nextExperimentId}, ${ctx.projectId}, 'active', NOW())
    `;

    const challenger: PositioningHypothesis = { ...proposal.positioning, id: 'a' };
    const incumbent: PositioningHypothesis = {
      ...ctx.winner,
      id: 'b',
      label: `${ctx.winner.label} (previous winner)`,
    };

    for (const hypothesis of [challenger, incumbent]) {
      const landingContent = await generateLandingContent(hypothesis, ctx.analysis);
      await db`
        INSERT INTO variants (id, experiment_id, name, positioning_json, landing_content_json, created_at)
        VALUES (${crypto.randomUUID()}, ${nextExperimentId}, ${hypothesis.id}, ${JSON.stringify(hypothesis)}, ${JSON.stringify(landingContent)}, NOW())
      `;
    }

    await db`UPDATE experiments SET status = 'iterated' WHERE id = ${experimentId}`;

    const deployed = await db<{ id: string; name: string }>`
      SELECT id, name FROM variants WHERE experiment_id = ${nextExperimentId}
    `;

    return NextResponse.json({
      approved: true,
      experimentId: nextExperimentId,
      variants: deployed,
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return apiError('V3', new ApiError('Request body is not valid JSON.', 400));
    }
    return apiError('V3', error);
  }
}

/** Returns the latest stored proposal without generating a new one. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    await initDB();
    const { experimentId } = await params;

    const rows = await db<{ content_json: string; created_at: string }>`
      SELECT content_json, created_at FROM iterations
      WHERE parent_experiment_id = ${experimentId} ORDER BY created_at DESC LIMIT 1
    `;
    if (rows.length === 0) return NextResponse.json({ proposal: null });

    return NextResponse.json({
      proposal: parseStoredJson(rows[0].content_json, 'proposal'),
      created_at: rows[0].created_at,
    });
  } catch (error: unknown) {
    return apiError('V3:GET', error);
  }
}
