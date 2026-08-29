import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    const { experimentId } = await params;
    const { searchParams } = new URL(request.url);
    const variantName = searchParams.get('name');

    if (!variantName) {
      return NextResponse.json({ error: 'Variant name required' }, { status: 400 });
    }

    const db = getDb();

    const variant = db.prepare(
      'SELECT * FROM variants WHERE experiment_id = ? AND name = ?'
    ).get(experimentId, variantName) as {
      id: string;
      name: string;
      positioning_json: string;
      landing_content_json: string;
    } | undefined;

    if (!variant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    return NextResponse.json({
      variant: {
        id: variant.id,
        name: variant.name,
        positioning: JSON.parse(variant.positioning_json),
        landingContent: JSON.parse(variant.landing_content_json),
      },
    });
  } catch (error: unknown) {
    console.error('Variant fetch error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch variant';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
