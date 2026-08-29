import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { parseGitHubUrl, gatherRepoIntelligence } from '@/lib/github/service';
import { analyzeRepository } from '@/lib/ai/analysis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repoUrl, productUrl } = body;

    if (!repoUrl && !productUrl) {
      return NextResponse.json({ error: 'Please provide a GitHub repository URL or product URL' }, { status: 400 });
    }

    const db = getDb();
    const projectId = uuid();

    if (repoUrl) {
      const parsed = parseGitHubUrl(repoUrl);
      if (!parsed) {
        return NextResponse.json({ error: 'Invalid GitHub URL format' }, { status: 400 });
      }

      // Create project
      db.prepare('INSERT INTO projects (id, name, repo_url, created_at) VALUES (?, ?, ?, datetime("now"))')
        .run(projectId, parsed.repo, repoUrl);

      // Fetch repo intelligence
      const intelligence = await gatherRepoIntelligence(parsed.owner, parsed.repo);

      // Analyze product
      const analysis = await analyzeRepository(intelligence);

      // Store analysis
      db.prepare('INSERT INTO product_analyses (id, project_id, analysis_json, created_at) VALUES (?, ?, ?, datetime("now"))')
        .run(uuid(), projectId, JSON.stringify(analysis));

      return NextResponse.json({
        projectId,
        analysis,
        repoInfo: intelligence.repoInfo,
      });
    } else {
      // Product URL mode - simplified
      db.prepare('INSERT INTO projects (id, name, product_url, created_at) VALUES (?, ?, ?, datetime("now"))')
        .run(projectId, new URL(productUrl).hostname, productUrl);

      // For product URLs, we can't do deep analysis - create basic analysis
      const analysis = {
        product_name: new URL(productUrl).hostname,
        summary: `Product at ${productUrl}`,
        problem: 'User-provided product URL',
        target_users: ['End users'],
        features: ['Product functionality'],
        technical_capabilities: ['Web application'],
        differentiators: ['Unique approach'],
        evidence: [`User provided URL: ${productUrl}`],
        confidence: 0.3,
      };

      db.prepare('INSERT INTO product_analyses (id, project_id, analysis_json, created_at) VALUES (?, ?, ?, datetime("now"))')
        .run(uuid(), projectId, JSON.stringify(analysis));

      return NextResponse.json({ projectId, analysis, repoInfo: null });
    }
  } catch (error: unknown) {
    console.error('Analysis error:', error);
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
