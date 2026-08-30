import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { ApiError, apiError, readJsonBody, readString } from '@/lib/api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    await initDB();

    const { experimentId } = await params;
    const variantId = readString(body.variantId, 'variantId', { max: 100 });
    const sanitized = readString(body.text, 'Feedback', { max: 1000 });

    // Verify the pair exists before inserting: previously a bad id reached the
    // foreign key and surfaced as a 500 rather than an honest 404.
    const variant = await db<{ id: string }>`
      SELECT id FROM variants WHERE id = ${variantId} AND experiment_id = ${experimentId}
    `;
    if (variant.length === 0) {
      throw new ApiError('That variant does not belong to this experiment.', 404);
    }

    await db`INSERT INTO feedback (id, experiment_id, variant_id, text, created_at) VALUES (${crypto.randomUUID()}, ${experimentId}, ${variantId}, ${sanitized}, NOW())`;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return apiError('FEEDBACK', error);
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
    return apiError('FEEDBACK:GET', error);
  }
}
