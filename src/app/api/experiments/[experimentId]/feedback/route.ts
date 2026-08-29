import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    await initDB();
    const { experimentId } = await params;
    const body = await request.json();
    const { variantId, text } = body;

    if (!variantId || !text) {
      return NextResponse.json({ error: 'variantId and text required' }, { status: 400 });
    }

    const sanitized = String(text).trim().slice(0, 1000);
    if (!sanitized) {
      return NextResponse.json({ error: 'Feedback cannot be empty' }, { status: 400 });
    }

    await db`INSERT INTO feedback (id, experiment_id, variant_id, text, created_at) VALUES (${crypto.randomUUID()}, ${experimentId}, ${variantId}, ${sanitized}, NOW())`;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[FEEDBACK] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to save feedback';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    await initDB();
    const { experimentId } = await params;

    const feedback = await db`SELECT f.id, f.text, f.created_at, f.variant_id, v.name as variant_name FROM feedback f JOIN variants v ON f.variant_id = v.id WHERE f.experiment_id = ${experimentId} ORDER BY f.created_at DESC`;

    return NextResponse.json({ feedback });
  } catch (error: unknown) {
    console.error('[FEEDBACK:GET] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch feedback';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
