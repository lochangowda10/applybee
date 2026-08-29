import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, targetUser, alternative, differentiation, desiredAction } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    const existing = await db<{ id: string }>`SELECT id FROM founder_contexts WHERE project_id = ${projectId}`;

    if (existing.length > 0) {
      await db`UPDATE founder_contexts SET target_user = ${targetUser || null}, alternative = ${alternative || null}, differentiation = ${differentiation || null}, desired_action = ${desiredAction || null} WHERE id = ${existing[0].id}`;
    } else {
      await db`INSERT INTO founder_contexts (id, project_id, target_user, alternative, differentiation, desired_action, created_at) VALUES (${uuid()}, ${projectId}, ${targetUser || null}, ${alternative || null}, ${differentiation || null}, ${desiredAction || null}, NOW())`;
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[CONTEXT] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to save context';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
