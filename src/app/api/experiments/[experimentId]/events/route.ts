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
    const { variantId, eventType, sessionId, metadata } = body;

    if (!variantId || !eventType) {
      return NextResponse.json({ error: 'variantId and eventType required' }, { status: 400 });
    }

    const db = getDb();

    // Verify experiment exists
    const experiment = db.prepare('SELECT id FROM experiments WHERE id = ?').get(experimentId);
    if (!experiment) {
      return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    }

    db.prepare(`
      INSERT INTO analytics_events (id, experiment_id, variant_id, event_type, session_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(uuid(), experimentId, variantId, eventType, sessionId || null, metadata || null);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Event tracking error:', error);
    const message = error instanceof Error ? error.message : 'Failed to track event';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    const { experimentId } = await params;
    const db = getDb();

    // Get all variants
    const variants = db.prepare(
      'SELECT id, name FROM variants WHERE experiment_id = ?'
    ).all(experimentId) as { id: string; name: string }[];

    const analytics = await Promise.all(
      variants.map(async (variant) => {
        const views = db.prepare(
          `SELECT COUNT(DISTINCT session_id) as count FROM analytics_events
           WHERE experiment_id = ? AND variant_id = ? AND event_type = 'page_view'`
        ).get(experimentId, variant.id) as { count: number };

        const clicks = db.prepare(
          `SELECT COUNT(*) as count FROM analytics_events
           WHERE experiment_id = ? AND variant_id = ? AND event_type = 'cta_click'`
        ).get(experimentId, variant.id) as { count: number };

        const feedbackEntries = db.prepare(
          `SELECT text, created_at FROM feedback
           WHERE experiment_id = ? AND variant_id = ?
           ORDER BY created_at DESC`
        ).all(experimentId, variant.id) as { text: string; created_at: string }[];

        return {
          variantId: variant.id,
          name: variant.name,
          views: views.count,
          clicks: clicks.count,
          conversion: views.count > 0 ? ((clicks.count / views.count) * 100).toFixed(1) : '0.0',
          feedback: feedbackEntries,
        };
      })
    );

    return NextResponse.json({ analytics });
  } catch (error: unknown) {
    console.error('Analytics fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
