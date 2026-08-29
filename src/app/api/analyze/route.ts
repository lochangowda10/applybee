import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { initDB } from '@/lib/init';
import { parseGitHubUrl, gatherRepoIntelligence } from '@/lib/github/service';
import { analyzeRepository } from '@/lib/ai/analysis';

export async function POST(request: NextRequest) {
  try {
    await initDB();
    const body = await request.json();
    const { repoUrl, productUrl } = body;

    if (!repoUrl && !productUrl) {
      return NextResponse.json({ error: 'Please provide a GitHub repository URL or product URL' }, { status: 400 });
    }

    const projectId = crypto.randomUUID();

    if (repoUrl) {
      const parsed = parseGitHubUrl(repoUrl);
      if (!parsed) {
        return NextResponse.json({ error: 'Invalid GitHub URL. Use format: https://github.com/owner/repo' }, { status: 400 });
      }

      await db`INSERT INTO projects (id, name, repo_url, created_at) VALUES (${projectId}, ${parsed.repo}, ${repoUrl}, NOW())`;

      const intelligence = await gatherRepoIntelligence(parsed.owner, parsed.repo);
      const analysis = await analyzeRepository(intelligence);

      await db`INSERT INTO product_analyses (id, project_id, analysis_json, created_at) VALUES (${crypto.randomUUID()}, ${projectId}, ${JSON.stringify(analysis)}, NOW())`;

      return NextResponse.json({ projectId, analysis, repoInfo: intelligence.repoInfo });
    } else {
      const hostname = new URL(productUrl).hostname;
      await db`INSERT INTO projects (id, name, product_url, created_at) VALUES (${projectId}, ${hostname}, ${productUrl}, NOW())`;

      const analysis = {
        product_name: hostname,
        summary: `Product at ${productUrl}`,
        problem: 'User-provided product URL',
        target_users: ['End users'],
        features: ['Product functionality'],
        technical_capabilities: ['Web application'],
        differentiators: ['Unique approach'],
        evidence: [`User provided URL: ${productUrl}`],
        confidence: 0.3,
      };

      await db`INSERT INTO product_analyses (id, project_id, analysis_json, created_at) VALUES (${crypto.randomUUID()}, ${projectId}, ${JSON.stringify(analysis)}, NOW())`;

      return NextResponse.json({ projectId, analysis, repoInfo: null });
    }
  } catch (error: unknown) {
    console.error('[ANALYZE] Error:', error);
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
