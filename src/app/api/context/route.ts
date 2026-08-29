import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, targetUser, alternative, differentiation, desiredAction } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    const db = getDb();

    // Check if context already exists for this project
    const existing = db.prepare('SELECT id FROM founder_contexts WHERE project_id = ?').get(projectId) as { id: string } | undefined;

    if (existing) {
      // Update existing
      db.prepare(`
        UPDATE founder_contexts
        SET target_user = ?, alternative = ?, differentiation = ?, desired_action = ?
        WHERE id = ?
      `).run(targetUser, alternative, differentiation, desiredAction, existing.id);
    } else {
      // Insert new
      db.prepare(`
        INSERT INTO founder_contexts (id, project_id, target_user, alternative, differentiation, desired_action, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(uuid(), projectId, targetUser, alternative, differentiation, desiredAction);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Context save error:', error);
    const message = error instanceof Error ? error.message : 'Failed to save context';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
