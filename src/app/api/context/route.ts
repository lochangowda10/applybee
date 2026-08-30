import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { ApiError, apiError, readJsonBody, readString } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    await initDB();

    const projectId = readString(body.projectId, 'Project ID', { max: 100 });

    const project = await db<{ id: string }>`SELECT id FROM projects WHERE id = ${projectId}`;
    if (project.length === 0) {
      throw new ApiError('Project not found.', 404);
    }

    const targetUser = readString(body.targetUser, 'targetUser', { required: false });
    const alternative = readString(body.alternative, 'alternative', { required: false });
    const differentiation = readString(body.differentiation, 'differentiation', { required: false });
    const desiredAction = readString(body.desiredAction, 'desiredAction', { required: false });

    const existing = await db<{ id: string }>`SELECT id FROM founder_contexts WHERE project_id = ${projectId}`;

    if (existing.length > 0) {
      await db`UPDATE founder_contexts SET target_user = ${targetUser || null}, alternative = ${alternative || null}, differentiation = ${differentiation || null}, desired_action = ${desiredAction || null} WHERE id = ${existing[0].id}`;
    } else {
      await db`INSERT INTO founder_contexts (id, project_id, target_user, alternative, differentiation, desired_action, created_at) VALUES (${crypto.randomUUID()}, ${projectId}, ${targetUser || null}, ${alternative || null}, ${differentiation || null}, ${desiredAction || null}, NOW())`;
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiError('CONTEXT', error);
  }
}
