import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { ApiError, apiError, readJsonBody, readString } from '@/lib/api';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/** Only the events the product actually records; anything else is rejected. */
const EVENT_TYPES = new Set(['page_view', 'cta_click']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    await initDB();

    const { experimentId } = await params;
    const variantId = readString(body.variantId, 'variantId', { max: 100 });
    const eventType = readString(body.eventType, 'eventType', { max: 40 });
    const sessionId = readString(body.sessionId, 'sessionId', { required: false, max: 100 });
    const metadata = readString(body.metadata, 'metadata', { required: false, max: 2000 });

    /**
     * Two buckets, because one is not enough here.
     *
     * The session bucket is the tight one, and it is what keeps a single
     * visitor's page from looping. But sessionId comes from the client, so a
     * script that mints a fresh one per request walks straight past it — a
     * limiter keyed only on attacker-controlled input bounds nothing. The IP
     * ceiling is what actually closes that: far above what a room of people
     * sharing one venue NAT can produce, far below what a loop does in a
     * second.
     */
    const perSession = await rateLimit(
      `events:s:${sessionId || clientIp(request)}`,
      120,
      60
    );
    if (perSession.limited) return perSession.response;

    const perIp = await rateLimit(`events:ip:${clientIp(request)}`, 1200, 60);
    if (perIp.limited) return perIp.response;

    if (!EVENT_TYPES.has(eventType)) {
      throw new ApiError(`Unknown event type "${eventType}".`, 400);
    }

    // The variant must belong to this experiment. Without this check a caller
    // could attach events to another experiment's variant and quietly corrupt
    // the numbers a founder is about to draw conclusions from.
    const variant = await db<{ id: string }>`
      SELECT id FROM variants WHERE id = ${variantId} AND experiment_id = ${experimentId}
    `;
    if (variant.length === 0) {
      throw new ApiError('That variant does not belong to this experiment.', 404);
    }

    await db`INSERT INTO analytics_events (id, experiment_id, variant_id, event_type, session_id, metadata, created_at) VALUES (${crypto.randomUUID()}, ${experimentId}, ${variantId}, ${eventType}, ${sessionId || null}, ${metadata || null}, NOW())`;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiError('EVENTS', error);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    await initDB();
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
    return apiError('EVENTS:GET', error);
  }
}
