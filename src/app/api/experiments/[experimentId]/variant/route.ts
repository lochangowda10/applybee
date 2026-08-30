import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { ApiError, apiError, parseStoredJson } from '@/lib/api';

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
      throw new ApiError('Variant name required.', 400);
    }

    const variants = await db<{ id: string; name: string; positioning_json: string; landing_content_json: string }>`SELECT id, name, positioning_json, landing_content_json FROM variants WHERE experiment_id = ${experimentId} AND name = ${variantName}`;

    if (variants.length === 0) {
      throw new ApiError('Variant not found.', 404);
    }

    const variant = variants[0];

    return NextResponse.json({
      variant: {
        id: variant.id,
        name: variant.name,
        positioning: parseStoredJson(variant.positioning_json, 'positioning'),
        landingContent: parseStoredJson(variant.landing_content_json, 'landing content'),
      },
    });
  } catch (error: unknown) {
    return apiError('VARIANT', error);
  }
}
