import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    const { experimentId } = await params;
    const body = await request.json();
    const { variantId, text } = body;

    if (!variantId || !text) {
      return NextResponse.json({ error: 'variantId and text required' }, { status: 400 });
    }

    const db = getDb();

    db.prepare(`
      INSERT INTO feedback (id, experiment_id, variant_id, text, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(uuid(), experimentId, variantId, text);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Feedback error:', error);
    const message = error instanceof Error ? error.message : 'Failed to save feedback';
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

    const feedback = db.prepare(
      `SELECT f.*, v.name as variant_name FROM feedback f
       JOIN variants v ON f.variant_id = v.id
       WHERE f.experiment_id = ?
       ORDER BY f.created_at DESC`
    ).all(experimentId);

    return NextResponse.json({ feedback });
  } catch (error: unknown) {
    console.error('Feedback fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch feedback';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
