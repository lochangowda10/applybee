import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { db } from '@/lib/db';

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

    const experiment = await db<{ id: string }>`SELECT id FROM experiments WHERE id = ${experimentId}`;
    if (experiment.length === 0) {
      return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
    }

    await db`INSERT INTO analytics_events (id, experiment_id, variant_id, event_type, session_id, metadata, created_at) VALUES (${uuid()}, ${experimentId}, ${variantId}, ${eventType}, ${sessionId || null}, ${metadata || null}, NOW())`;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[EVENTS] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to track event';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    const { experimentId } = await params;

    const variants = await db<{ id: string; name: string }>`SELECT id, name FROM variants WHERE experiment_id = ${experimentId}`;

    const analytics = await Promise.all(
      variants.map(async (variant) => {
        const viewsRows = await db<{ count: string }>`SELECT COUNT(DISTINCT session_id) as count FROM analytics_events WHERE experiment_id = ${experimentId} AND variant_id = ${variant.id} AND event_type = 'page_view'`;
        const clicksRows = await db<{ count: string }>`SELECT COUNT(*) as count FROM analytics_events WHERE experiment_id = ${experimentId} AND variant_id = ${variant.id} AND event_type = 'cta_click'`;
        const feedbackEntries = await db<{ text: string; created_at: string }>`SELECT text, created_at FROM feedback WHERE experiment_id = ${experimentId} AND variant_id = ${variant.id} ORDER BY created_at DESC LIMIT 10`;

        const views = parseInt(viewsRows[0]?.count || '0', 10);
        const clicks = parseInt(clicksRows[0]?.count || '0', 10);

        return {
          variantId: variant.id,
          name: variant.name,
          views,
          clicks,
          conversion: views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0',
          feedback: feedbackEntries,
        };
      })
    );

    return NextResponse.json({ analytics });
  } catch (error: unknown) {
    console.error('[EVENTS:GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
