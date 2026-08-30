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

    /**
     * The project is joined in for one reason: the generated call to action
     * needs somewhere to go. A button that only records a click and says
     * "Thanks!" is a dead end for the visitor, and a page that asks someone to
     * act should honour the click.
     */
    const variants = await db<{
      id: string;
      name: string;
      positioning_json: string;
      landing_content_json: string;
      product_url: string | null;
      repo_url: string | null;
      referral_code: string | null;
    }>`
      SELECT v.id, v.name, v.positioning_json, v.landing_content_json,
             p.product_url, p.repo_url, u.referral_code
      FROM variants v
      JOIN experiments e ON e.id = v.experiment_id
      JOIN projects p ON p.id = e.project_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE v.experiment_id = ${experimentId} AND v.name = ${variantName}
    `;

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
        // The deployed product first, the repo as a fallback. Null when the
        // founder only described the product — there is nothing to link to,
        // and inventing a destination would be worse than not having one.
        destination: variant.product_url || variant.repo_url || null,
        // The project owner's referral code, so the page footer can carry an
        // account-level referral link alongside the passive variant marker.
        referralCode: variant.referral_code ?? null,
      },
    });
  } catch (error: unknown) {
    return apiError('VARIANT', error);
  }
}
