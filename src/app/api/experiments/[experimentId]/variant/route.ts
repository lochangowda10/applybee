import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ experimentId: string }> }
) {
  try {
    await initDB();
    const { experimentId } = await params;
    const { searchParams } = new URL(request.url);
    const variantName = searchParams.get('name');

    if (!variantName) {
      return NextResponse.json({ error: 'Variant name required' }, { status: 400 });
    }

    const variants = await db<{ id: string; name: string; positioning_json: string; landing_content_json: string }>`SELECT id, name, positioning_json, landing_content_json FROM variants WHERE experiment_id = ${experimentId} AND name = ${variantName}`;

    if (variants.length === 0) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    const variant = variants[0];

    return NextResponse.json({
      variant: {
        id: variant.id,
        name: variant.name,
        positioning: JSON.parse(variant.positioning_json),
        landingContent: JSON.parse(variant.landing_content_json),
      },
    });
  } catch (error: unknown) {
    console.error('[VARIANT] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch variant';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
