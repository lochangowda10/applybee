import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { parseGitHubUrl, gatherRepoIntelligence } from '@/lib/github/service';
import { analyzeRepository, type ProductAnalysis } from '@/lib/ai/analysis';
import {
  classifyInput,
  toAbsoluteUrl,
  analyzeProductUrl,
  analyzeDescription,
} from '@/lib/input/sources';
import { ApiError, apiError, readJsonBody, readString } from '@/lib/api';
import { ensureOwnerId } from '@/lib/owner';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import {
  findUserByReferralCode,
  getSessionUser,
  normalizeReferralCode,
} from '@/lib/auth';

type RepoInfo = Awaited<ReturnType<typeof gatherRepoIntelligence>>['repoInfo'];

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<{
      repoUrl?: unknown;
      productUrl?: unknown;
      description?: unknown;
      input?: unknown;
      ref?: unknown;
      code?: unknown;
    }>(request);
    await initDB();

    // AI spend per call — cap scripted farming. Generous enough that a room
    // of judges sharing one venue NAT never trips it.
    const rl = await rateLimit(`analyze:${clientIp(request)}`, 30, 3600);
    if (rl.limited) return rl.response;

    // Accept the three declared inputs under any of the field names the client
    // has used, then classify rather than trusting which field it arrived in —
    // a pasted paragraph used to land in productUrl and crash `new URL()`.
    const raw =
      readString(body.input, 'input', { required: false, max: 4000 }) ||
      readString(body.repoUrl, 'repoUrl', { required: false, max: 500 }) ||
      readString(body.productUrl, 'productUrl', { required: false, max: 500 }) ||
      readString(body.description, 'description', { required: false, max: 4000 });

    if (!raw) {
      throw new ApiError(
        'Paste a public GitHub repository, a product URL, or describe your product in a sentence.',
        400
      );
    }

    const ref = readString(body.ref, 'ref', { required: false, max: 100 });
    const kind = classifyInput(raw);
    const projectId = crypto.randomUUID();

    // The project is claimed by whoever created it. Minting the id here means
    // a founder never sees a sign-up form before they have seen the product.
    const { ownerId, setOn } = ensureOwnerId(request);

    // If the founder is signed in, the project is also attached to their
    // account so their dashboard can list it later. Optional: an anonymous
    // run keeps working exactly as it did.
    const sessionUser = await getSessionUser(request);

    /**
     * Records that this project was started by someone who arrived through a
     * generated page. Best-effort: a stale or forged ref must never stop a
     * founder from analyzing their product.
     */
    async function recordReferral() {
      if (!ref) return;
      try {
        const rows = await db<{ id: string; experiment_id: string }>`
          SELECT id, experiment_id FROM variants WHERE id = ${ref}
        `;
        if (rows.length === 0) return;
        await db`
          INSERT INTO referrals (id, referrer_experiment_id, referrer_variant_id, referred_project_id, created_at)
          VALUES (${crypto.randomUUID()}, ${rows[0].experiment_id}, ${rows[0].id}, ${projectId}, NOW())
        `;
      } catch (err) {
        console.error('[ANALYZE] Referral not recorded:', err);
      }
    }

    /**
     * Records an account-level referral claim when a signed-in founder starts
     * a project after arriving through a ?code= link. Best-effort, and
     * idempotent: the unique pair makes a repeat claim a no-op.
     */
    async function recordCodeClaim() {
      const codeRaw = readString(body.code, 'code', { required: false, max: 32 });
      if (!codeRaw || !sessionUser) return;
      try {
        const code = normalizeReferralCode(codeRaw);
        if (!code) return;
        const referrer = await findUserByReferralCode(code);
        if (!referrer || referrer.id === sessionUser.id) return;
        await db`
          INSERT INTO referral_claims (id, referrer_user_id, claimer_user_id, claimed_at)
          VALUES (${crypto.randomUUID()}, ${referrer.id}, ${sessionUser.id}, NOW())
          ON CONFLICT (referrer_user_id, claimer_user_id) DO NOTHING
        `;
      } catch (err) {
        console.error('[ANALYZE] Referral code claim not recorded:', err);
      }
    }

    let name: string;
    let repoUrlValue: string | null = null;
    let productUrlValue: string | null = null;
    let analysis: ProductAnalysis;
    let repoInfo: RepoInfo | null = null;

    if (kind === 'repo') {
      const parsed = parseGitHubUrl(raw);
      if (!parsed) {
        throw new ApiError(
          'That GitHub URL could not be read. Use the format https://github.com/owner/repo.',
          400
        );
      }
      name = parsed.repo;
      repoUrlValue = raw;

      await db`INSERT INTO projects (id, name, repo_url, owner_id, user_id, created_at) VALUES (${projectId}, ${name}, ${repoUrlValue}, ${ownerId}, ${sessionUser?.id ?? null}, NOW())`;
      await recordReferral();
      await recordCodeClaim();

      const intelligence = await gatherRepoIntelligence(parsed.owner, parsed.repo);
      analysis = await analyzeRepository(intelligence);
      repoInfo = intelligence.repoInfo;

      /**
       * A repo's homepage field is almost always the deployed product, and it
       * is the only place a destination for the generated call to action can
       * come from on this path. Stored after the fact because the project row
       * is written before GitHub is called, so the id exists to resume from
       * even if the repo turns out to be unreadable.
       */
      const homepage = repoInfo.homepage ? toAbsoluteUrl(repoInfo.homepage) : null;
      if (homepage) {
        productUrlValue = homepage;
        await db`UPDATE projects SET product_url = ${homepage} WHERE id = ${projectId}`;
      }
    } else if (kind === 'url') {
      const absolute = toAbsoluteUrl(raw);
      if (!absolute) {
        throw new ApiError(
          'That does not look like a reachable web address. Try a full URL, or describe your product instead.',
          400
        );
      }
      name = new URL(absolute).hostname.replace(/^www\./, '');
      productUrlValue = absolute;

      await db`INSERT INTO projects (id, name, product_url, owner_id, user_id, created_at) VALUES (${projectId}, ${name}, ${productUrlValue}, ${ownerId}, ${sessionUser?.id ?? null}, NOW())`;
      await recordReferral();
      await recordCodeClaim();

      analysis = await analyzeProductUrl(absolute);
    } else {
      if (raw.length < 12) {
        throw new ApiError(
          'Tell us a little more — a sentence about what your product does is enough.',
          400
        );
      }
      analysis = await analyzeDescription(raw);
      name = analysis.product_name || 'Your product';

      await db`INSERT INTO projects (id, name, owner_id, user_id, created_at) VALUES (${projectId}, ${name}, ${ownerId}, ${sessionUser?.id ?? null}, NOW())`;
      await recordReferral();
      await recordCodeClaim();
    }

    await db`INSERT INTO product_analyses (id, project_id, analysis_json, created_at) VALUES (${crypto.randomUUID()}, ${projectId}, ${JSON.stringify(analysis)}, NOW())`;

    const response = NextResponse.json({ projectId, analysis, repoInfo, inputKind: kind });
    setOn(response);
    return response;
  } catch (error: unknown) {
    return apiError('ANALYZE', error);
  }
}
