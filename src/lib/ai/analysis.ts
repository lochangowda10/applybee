/**
 * Product Analysis Engine
 * Takes GitHub repo intelligence and produces structured product understanding.
 */

import { chatJSON, chatJSONArray, isAIConfigured } from './provider';

/**
 * Runs an AI call, falling back to deterministic generated content if it times
 * out, errors, or returns unusable JSON.
 *
 * The demo must always produce a page. A model failure should cost quality,
 * never a blank screen, so every AI path has a non-AI path behind it.
 */
async function withFallback<T>(
  attempt: () => Promise<T>,
  fallback: () => T,
  label: string
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[AI] ${label} failed, using fallback content: ${message}`);
    return fallback();
  }
}
import type { RepoIntelligence } from '../github/service';

export interface ProductAnalysis {
  product_name: string;
  summary: string;
  problem: string;
  target_users: string[];
  features: string[];
  technical_capabilities: string[];
  differentiators: string[];
  evidence: string[];
  confidence: number;
}

export interface PositioningHypothesis {
  id: string;
  label: string;
  type: string;
  target_audience: string;
  primary_pain: string;
  headline: string;
  subheadline: string;
  main_promise: string;
  benefits: string[];
  cta: string;
  proof_angle: string;
  why_this_framing: string;
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export interface LandingContent {
  hero: {
    headline: string;
    subheadline: string;
    cta: string;
    ctaSubtext: string;
  };
  problem: {
    title: string;
    description: string;
    painPoints: string[];
  };
  benefits: {
    title: string;
    items: { title: string; description: string }[];
  };
  howItWorks: {
    title: string;
    steps: { step: number; title: string; description: string }[];
  };
  features: {
    title: string;
    items: { title: string; description: string; icon: string }[];
  };
  cta: {
    headline: string;
    subheadline: string;
    button: string;
  };
}

export async function analyzeRepository(intelligence: RepoIntelligence): Promise<ProductAnalysis> {
  if (!isAIConfigured()) {
    return generateMockAnalysis(intelligence);
  }

  // Build context from repo intelligence
  const fileSummary = intelligence.keyFiles.map(f => {
    const contentPreview = f.content.slice(0, 1500);
    return `--- ${f.path} ---\n${contentPreview}`;
  }).join('\n\n');

  const folderList = intelligence.folderStructure.join('\n');

  const fileList = intelligence.fileTree
    .filter(f => f.type === 'file')
    .map(f => f.path)
    .join('\n');

  const systemPrompt = `You are a product analyst that examines GitHub repositories to understand what software products do, who they're for, and what makes them interesting.

You must ground all conclusions in actual evidence from the codebase. Do NOT hallucinate product capabilities that aren't supported by the code.

Return valid JSON matching the schema exactly.`;

  const userPrompt = `Analyze this GitHub repository and determine what product it represents.

REPOSITORY: ${intelligence.repoInfo.fullName}
DESCRIPTION: ${intelligence.repoInfo.description || 'None provided'}
LANGUAGE: ${intelligence.repoInfo.language || 'Unknown'}
TOPICS: ${intelligence.repoInfo.topics.join(', ') || 'None'}
STARS: ${intelligence.repoInfo.stars}
HOMEPAGE: ${intelligence.repoInfo.homepage || 'None'}

FOLDER STRUCTURE:
${folderList}

FILE LISTING:
${fileList}

KEY FILE CONTENTS:
${fileSummary}

Based on this evidence, analyze the product and return JSON with this exact schema:
{
  "product_name": "string - the name of the product/project",
  "summary": "string - 2-3 sentence summary of what this product does",
  "problem": "string - what problem does this solve",
  "target_users": ["string - who would use this"],
  "features": ["string - key features visible in the code"],
  "technical_capabilities": ["string - what technical things it can do"],
  "differentiators": ["string - what might make it stand out"],
  "evidence": ["string - specific evidence from code supporting these conclusions"],
  "confidence": number between 0 and 1
}`;

  return withFallback(
    () =>
      chatJSON<ProductAnalysis>(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.2, maxTokens: 2000 }
      ),
    () => generateMockAnalysis(intelligence),
    'analyzeRepository'
  );
}

export async function generatePositioning(
  analysis: ProductAnalysis,
  founderContext: {
    target_user?: string;
    alternative?: string;
    differentiation?: string;
    desired_action?: string;
  }
): Promise<PositioningHypothesis[]> {
  if (!isAIConfigured()) {
    return generateMockPositioning(analysis, founderContext);
  }

  const systemPrompt = `You are a positioning strategist for startups. Generate two clearly different positioning hypotheses for the same product.

IMPORTANT: The two hypotheses must represent fundamentally different angles, not just different wording. 
- Hypothesis A should be Outcome/Pain-oriented (focus on the pain being solved and the outcome)
- Hypothesis B should be Capability/Transformation-oriented (focus on what the product enables)

Each hypothesis gets a distinct color scheme. Return valid JSON array with exactly 2 items.`;

  const userPrompt = `Generate two positioning hypotheses for this product:

PRODUCT: ${analysis.product_name}
SUMMARY: ${analysis.summary}
PROBLEM: ${analysis.problem}
TARGET USERS: ${analysis.target_users.join(', ')}
KEY FEATURES: ${analysis.features.join(', ')}
DIFFERENTIATORS: ${analysis.differentiators.join(', ')}

FOUNDER CONTEXT:
- Target user: ${founderContext.target_user || 'Not specified'}
- Current alternatives: ${founderContext.alternative || 'Not specified'}
- What makes it better: ${founderContext.differentiation || 'Not specified'}
- Desired visitor action: ${founderContext.desired_action || 'Not specified'}

Return a JSON array with exactly 2 positioning hypotheses matching this schema:
[{
  "id": "a" or "b",
  "label": "Positioning A" or "Positioning B",
  "type": "outcome-pain" or "capability-transformation",
  "target_audience": "string",
  "primary_pain": "string",
  "headline": "string - powerful headline",
  "subheadline": "string - supporting headline",
  "main_promise": "string - core value proposition",
  "benefits": ["string", "string", "string"],
  "cta": "string - call to action text",
  "proof_angle": "string - how to provide proof/credibility",
  "why_this_framing": "string - why this angle might work",
  "color_scheme": { "primary": "#hex", "secondary": "#hex", "accent": "#hex" }
}]`;

  // The downstream loop and the /e/[experimentId]/[variant] route both assume
  // exactly two variants keyed 'a' and 'b'. Normalize rather than trust the
  // model to have honoured "exactly 2 items".
  const normalize = (list: PositioningHypothesis[]): PositioningHypothesis[] =>
    list.slice(0, 2).map((h, i) => ({
      ...h,
      id: i === 0 ? 'a' : 'b',
      label: h?.label || (i === 0 ? 'Positioning A' : 'Positioning B'),
    }));

  return withFallback(
    async () => {
      const hypotheses = await chatJSONArray<PositioningHypothesis>(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.7, maxTokens: 3000 }
      );
      const normalized = normalize(hypotheses);
      // Returning one variant would leave the experiment with nothing to
      // compare against, so treat it as a failed generation and let the
      // fallback supply a complete pair. Measured on expressjs/express,
      // where the model answered with a single keyed object.
      if (normalized.length < 2) {
        throw new Error(
          `Model returned ${normalized.length} positioning hypothesis, expected 2.`
        );
      }
      return normalized;
    },
    () => normalize(generateMockPositioning(analysis, founderContext)),
    'generatePositioning'
  );
}

export async function generateLandingContent(
  hypothesis: PositioningHypothesis,
  analysis: ProductAnalysis
): Promise<LandingContent> {
  if (!isAIConfigured()) {
    return generateMockLandingContent(hypothesis, analysis);
  }

  const systemPrompt = `You are an expert landing page copywriter. Generate complete landing page content for a startup product. The content should feel premium and professional - like a YC-backed startup.

Write compelling, concise copy. Avoid fluff. Every word should earn its place.

Return valid JSON matching the exact schema.`;

  const userPrompt = `Generate landing page content for this positioning:

HEADLINE: ${hypothesis.headline}
SUBHEADLINE: ${hypothesis.subheadline}
MAIN PROMISE: ${hypothesis.main_promise}
TARGET AUDIENCE: ${hypothesis.target_audience}
PRIMARY PAIN: ${hypothesis.primary_pain}
BENEFITS: ${hypothesis.benefits.join(' | ')}
CTA: ${hypothesis.cta}
PROOF ANGLE: ${hypothesis.proof_angle}

PRODUCT: ${analysis.product_name}
FEATURES: ${analysis.features.join(', ')}
TECHNICAL CAPABILITIES: ${analysis.technical_capabilities.join(', ')}

Return JSON with this exact structure:
{
  "hero": {
    "headline": "string",
    "subheadline": "string",
    "cta": "string",
    "ctaSubtext": "string - small text under CTA"
  },
  "problem": {
    "title": "string",
    "description": "string",
    "painPoints": ["string", "string", "string"]
  },
  "benefits": {
    "title": "string",
    "items": [{"title": "string", "description": "string"}, ...]
  },
  "howItWorks": {
    "title": "string",
    "steps": [{"step": 1, "title": "string", "description": "string"}, ...]
  },
  "features": {
    "title": "string",
    "items": [{"title": "string", "description": "string", "icon": "string"}, ...]
  },
  "cta": {
    "headline": "string",
    "subheadline": "string",
    "button": "string"
  }
}`;

  return withFallback(
    () =>
      chatJSON<LandingContent>(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.6, maxTokens: 3000 }
      ),
    () => generateMockLandingContent(hypothesis, analysis),
    'generateLandingContent'
  );
}

export interface GrowthAnalysis {
  winner: string | null;
  confidence: string;
  observations: string[];
  visitor_confusion: string[];
  strongest_message: string;
  weakest_message: string;
  recommended_changes: string;
  next_hypothesis: string;
}

export async function analyzeExperimentResults(
  variantA: { views: number; clicks: number; feedback: string[] },
  variantB: { views: number; clicks: number; feedback: string[] },
  analysis: ProductAnalysis
): Promise<GrowthAnalysis> {
  if (!isAIConfigured()) {
    return generateMockGrowthAnalysis(variantA, variantB);
  }

  const systemPrompt = `You are a growth analyst reviewing early-stage A/B test results for landing page positioning experiments.

CRITICAL RULES:
- The sample sizes may be very small. Do NOT overstate statistical certainty.
- Use language like "early directional signal" when data is limited.
- Focus on qualitative insights from feedback alongside quantitative metrics.
- Be honest about what the data can and cannot tell us.

Return valid JSON matching the schema.`;

  const userPrompt = `Analyze these landing page experiment results:

VARIANT A (Outcome/Pain positioning):
- Page views: ${variantA.views}
- CTA clicks: ${variantA.clicks}
- Conversion rate: ${variantA.views > 0 ? ((variantA.clicks / variantA.views) * 100).toFixed(1) : 0}%
- Visitor feedback: ${variantA.feedback.length > 0 ? variantA.feedback.map(f => `"${f}"`).join(', ') : 'No feedback yet'}

VARIANT B (Capability/Transformation positioning):
- Page views: ${variantB.views}
- CTA clicks: ${variantB.clicks}
- Conversion rate: ${variantB.views > 0 ? ((variantB.clicks / variantB.views) * 100).toFixed(1) : 0}%
- Visitor feedback: ${variantB.feedback.length > 0 ? variantB.feedback.map(f => `"${f}"`).join(', ') : 'No feedback yet'}

PRODUCT: ${analysis.product_name}
SUMMARY: ${analysis.summary}

Return JSON:
{
  "winner": "a" or "b" or null (if inconclusive),
  "confidence": "string - honest confidence assessment",
  "observations": ["string - key observations"],
  "visitor_confusion": ["string - areas where visitors seemed confused"],
  "strongest_message": "string - which message resonated most",
  "weakest_message": "string - which message was weakest",
  "recommended_changes": "string - specific recommendations for next iteration",
  "next_hypothesis": "string - a new positioning hypothesis based on learning"
}`;

  return withFallback(
    () =>
      chatJSON<GrowthAnalysis>(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.5, maxTokens: 2000 }
      ),
    () => generateMockGrowthAnalysis(variantA, variantB),
    'analyzeGrowthResults'
  );
}

/**
 * The fields a V3 revision is allowed to change, and how to label them.
 *
 * Restricting the diff to a known list is what makes it reviewable: a founder
 * approving a rewrite needs to see every change, and a diff computed over an
 * open-ended object would silently omit whatever the model decided to add.
 */
const V3_FIELDS: { key: keyof PositioningHypothesis; label: string }[] = [
  { key: 'headline', label: 'Headline' },
  { key: 'subheadline', label: 'Subheadline' },
  { key: 'main_promise', label: 'Main promise' },
  { key: 'target_audience', label: 'Target audience' },
  { key: 'primary_pain', label: 'Primary pain' },
  { key: 'cta', label: 'Call to action' },
  { key: 'proof_angle', label: 'Proof angle' },
];

export interface V3Change {
  field: string;
  label: string;
  before: string;
  after: string;
  reason: string;
}

export interface V3Proposal {
  positioning: PositioningHypothesis;
  changes: V3Change[];
  summary: string;
}

/**
 * Computes the diff by comparing the stored strings, rather than asking the
 * model to report what it changed.
 *
 * A model describing its own edits can be wrong in the one direction that
 * matters here — claiming a line is unchanged when it is not — and a human is
 * approving a deployment on the strength of this list.
 */
function diffPositioning(
  before: PositioningHypothesis,
  after: PositioningHypothesis,
  reasons: Record<string, string>
): V3Change[] {
  const changes: V3Change[] = [];
  for (const { key, label } of V3_FIELDS) {
    const from = String(before[key] ?? '').trim();
    const to = String(after[key] ?? '').trim();
    if (!to || from === to) continue;
    changes.push({
      field: key,
      label,
      before: from,
      after: to,
      reason: reasons[key] || 'Revised in response to the visitor responses.',
    });
  }
  return changes;
}

/**
 * Proposes a third version from what visitors actually did and wrote.
 *
 * This is the step that makes the product a loop rather than a generator, and
 * it deliberately returns a proposal: nothing here is deployed until a human
 * approves it. The model is told to cite the responses, because a rewrite
 * grounded in its own prior is just the first draft again.
 */
export async function generateV3(
  winner: PositioningHypothesis,
  learning: GrowthAnalysis,
  analysis: ProductAnalysis,
  visitorFeedback: string[]
): Promise<V3Proposal> {
  const fallback = (): V3Proposal => {
    // Deterministic revision: lead with the hypothesis the analysis produced,
    // and say plainly that it came from the learning step rather than a model.
    const revised: PositioningHypothesis = {
      ...winner,
      id: 'a',
      label: 'V3 — revised from visitor responses',
      headline: learning.next_hypothesis || winner.headline,
      subheadline: learning.recommended_changes || winner.subheadline,
      why_this_framing:
        'Derived from the recorded experiment results without a model call.',
    };
    return {
      positioning: revised,
      changes: diffPositioning(winner, revised, {
        headline: 'Replaced with the next hypothesis from the results analysis.',
        subheadline: 'Replaced with the recommended change from the results analysis.',
      }),
      summary:
        'Generated without a model call, directly from the recorded experiment results.',
    };
  };

  if (!isAIConfigured()) return fallback();

  const systemPrompt = `You revise landing page positioning using evidence from a real experiment.

RULES:
- Change only what the evidence supports. Leaving a field identical is a valid answer.
- Every change must trace to something a visitor did or wrote. Do not invent new claims about the product.
- Sample sizes are small. Do not write copy that implies proven demand.
- Keep the same product. You are rewriting how it is described, not what it is.

Return valid JSON matching the schema.`;

  // Built outside the template so the newline join stays readable.
  const quotedFeedback =
    visitorFeedback.length > 0
      ? visitorFeedback.map((f) => `- "${f}"`).join('\n')
      : '- No written responses recorded';

  const userPrompt = `The winning version was:

HEADLINE: ${winner.headline}
SUBHEADLINE: ${winner.subheadline}
MAIN PROMISE: ${winner.main_promise}
TARGET AUDIENCE: ${winner.target_audience}
PRIMARY PAIN: ${winner.primary_pain}
CTA: ${winner.cta}
PROOF ANGLE: ${winner.proof_angle}

WHAT THE EXPERIMENT FOUND:
- Confidence: ${learning.confidence}
- Strongest message: ${learning.strongest_message}
- Weakest message: ${learning.weakest_message}
- Where visitors were confused: ${learning.visitor_confusion.join(' | ') || 'none recorded'}
- Recommended changes: ${learning.recommended_changes}
- Next hypothesis: ${learning.next_hypothesis}

WHAT VISITORS ACTUALLY WROTE:
${quotedFeedback}

PRODUCT: ${analysis.product_name} — ${analysis.summary}

Return JSON:
{
  "headline": "string",
  "subheadline": "string",
  "main_promise": "string",
  "target_audience": "string",
  "primary_pain": "string",
  "cta": "string",
  "proof_angle": "string",
  "reasons": {
    "<field name you changed>": "string - the visitor evidence that justifies this change"
  },
  "summary": "string - one sentence on what this revision is trying to fix"
}`;

  return withFallback(
    async () => {
      const result = await chatJSON<
        Partial<PositioningHypothesis> & {
          reasons?: Record<string, string>;
          summary?: string;
        }
      >(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.6, maxTokens: 2000 }
      );

      const revised: PositioningHypothesis = {
        ...winner,
        id: 'a',
        label: 'V3 — revised from visitor responses',
        headline: result.headline?.trim() || winner.headline,
        subheadline: result.subheadline?.trim() || winner.subheadline,
        main_promise: result.main_promise?.trim() || winner.main_promise,
        target_audience: result.target_audience?.trim() || winner.target_audience,
        primary_pain: result.primary_pain?.trim() || winner.primary_pain,
        cta: result.cta?.trim() || winner.cta,
        proof_angle: result.proof_angle?.trim() || winner.proof_angle,
      };

      const changes = diffPositioning(winner, revised, result.reasons ?? {});

      // A revision that changed nothing is a real outcome, not a failure, but
      // it is not worth deploying — say so rather than shipping a copy.
      return {
        positioning: revised,
        changes,
        summary:
          result.summary?.trim() ||
          (changes.length === 0
            ? 'The evidence did not support changing the winning version.'
            : 'Revised in response to the recorded visitor responses.'),
      };
    },
    fallback,
    'generateV3'
  );
}

// ===== MOCK / DEMO FUNCTIONS =====

function generateMockAnalysis(intelligence: RepoIntelligence): ProductAnalysis {
  const name = intelligence.repoInfo.fullName.split('/')[1] || 'Unknown';
  const desc = intelligence.repoInfo.description || 'A software project';
  const lang = intelligence.repoInfo.language || 'Unknown';

  return {
    product_name: name,
    summary: desc,
    problem: 'This project addresses a need in the ' + lang + ' ecosystem.',
    target_users: ['Developers', 'Technical teams', lang + ' practitioners'],
    features: ['Core functionality', 'API endpoints', 'Configuration management'],
    technical_capabilities: [`Built with ${lang}`, 'Modular architecture', 'Extensible design'],
    differentiators: [`${lang} implementation`, 'Community driven', 'Open source'],
    evidence: [
      `Repository description: "${desc}"`,
      `Primary language: ${lang}`,
      `Has ${intelligence.repoInfo.stars} stars`,
      `Contains ${intelligence.fileTree.filter(f => f.type === 'file').length} files`,
    ],
    confidence: 0.65,
  };
}

function generateMockPositioning(
  analysis: ProductAnalysis,
  _context: Record<string, string | undefined>
): PositioningHypothesis[] {
  void _context; // Used in mock mode for context-aware positioning
  return [
    {
      id: 'a',
      label: 'Positioning A',
      type: 'outcome-pain',
      target_audience: analysis.target_users[0] || 'Developers',
      primary_pain: `Tired of struggling with ${analysis.summary.toLowerCase()}`,
      headline: `Stop wasting time on ${analysis.problem.toLowerCase().slice(0, 50)}`,
      subheadline: `${analysis.product_name} solves this so you don't have to.`,
      main_promise: analysis.features[0] || 'Get results faster',
      benefits: analysis.features.slice(0, 3),
      cta: 'Try It Free',
      proof_angle: 'Built by developers, for developers',
      why_this_framing: 'Pain-focused messaging creates urgency and emotional connection',
      color_scheme: { primary: '#1a1a2e', secondary: '#16213e', accent: '#e94560' },
    },
    {
      id: 'b',
      label: 'Positioning B',
      type: 'capability-transformation',
      target_audience: analysis.target_users[0] || 'Developers',
      primary_pain: 'Missing powerful capabilities for their workflow',
      headline: `Unlock the full potential of ${analysis.product_name}`,
      subheadline: `Transform how you work with ${analysis.technical_capabilities[0] || 'advanced tools'}.`,
      main_promise: analysis.technical_capabilities[0] || 'Powerful capabilities',
      benefits: analysis.technical_capabilities.slice(0, 3),
      cta: 'Get Started',
      proof_angle: 'Powered by cutting-edge technology',
      why_this_framing: 'Capability-focused messaging inspires aspiration and possibility',
      color_scheme: { primary: '#0f0f23', secondary: '#1a1a3e', accent: '#00d4aa' },
    },
  ];
}

function generateMockLandingContent(
  hypothesis: PositioningHypothesis,
  analysis: ProductAnalysis
): LandingContent {
  return {
    hero: {
      headline: hypothesis.headline,
      subheadline: hypothesis.subheadline,
      cta: hypothesis.cta,
      ctaSubtext: 'No credit card required',
    },
    problem: {
      title: 'The problem you face',
      description: `Every day, ${hypothesis.target_audience.toLowerCase()} struggle with ${hypothesis.primary_pain.toLowerCase()}. Existing solutions fall short.`,
      painPoints: [
        `Time wasted on ${hypothesis.primary_pain.toLowerCase()}`,
        'Existing tools are too complex',
        'No easy way to get started',
      ],
    },
    benefits: {
      title: 'What you get',
      items: hypothesis.benefits.map(b => ({
        title: b,
        description: `${b} - designed to help ${hypothesis.target_audience.toLowerCase()} work more effectively.`,
      })),
    },
    howItWorks: {
      title: 'How it works',
      steps: [
        { step: 1, title: 'Connect', description: `Get started with ${analysis.product_name} in seconds` },
        { step: 2, title: 'Configure', description: 'Set up your preferences and workflow' },
        { step: 3, title: 'Accelerate', description: 'See results immediately' },
      ],
    },
    features: {
      title: 'Key Features',
      items: analysis.features.slice(0, 4).map(f => ({
        title: f,
        description: `Built-in ${f.toLowerCase()} for seamless workflow`,
        icon: '⚡',
      })),
    },
    cta: {
      headline: `Ready to try ${analysis.product_name}?`,
      subheadline: 'Join early adopters who are already seeing results.',
      button: hypothesis.cta,
    },
  };
}

function generateMockGrowthAnalysis(
  a: { views: number; clicks: number; feedback: string[] },
  b: { views: number; clicks: number; feedback: string[] }
): GrowthAnalysis {
  const rateA = a.views > 0 ? a.clicks / a.views : 0;
  const rateB = b.views > 0 ? b.clicks / b.views : 0;
  const totalViews = a.views + b.views;

  if (totalViews < 10) {
    return {
      winner: null,
      confidence: 'Insufficient data - need more visitors for meaningful comparison',
      observations: [
        `Variant A: ${a.views} views, ${a.clicks} clicks (${(rateA * 100).toFixed(1)}% conversion)`,
        `Variant B: ${b.views} views, ${b.clicks} clicks (${(rateB * 100).toFixed(1)}% conversion)`,
        'Early directional signals only - not statistically significant',
      ],
      visitor_confusion: [],
      strongest_message: 'Insufficient data to determine',
      weakest_message: 'Insufficient data to determine',
      recommended_changes: 'Drive more traffic to both variants before drawing conclusions',
      next_hypothesis: 'Keep current variants and increase distribution',
    };
  }

  const winner = rateB > rateA ? 'b' : rateA > rateB ? 'a' : null;

  return {
    winner,
    confidence: `Early directional signal (n=${totalViews})`,
    observations: [
      `Variant A: ${a.views} views, ${a.clicks} clicks (${(rateA * 100).toFixed(1)}% conversion)`,
      `Variant B: ${b.views} views, ${b.clicks} clicks (${(rateB * 100).toFixed(1)}% conversion)`,
      `${winner ? `Variant ${winner.toUpperCase()} shows ${winner === 'b' ? rateB / (rateA || 0.01) : rateA / (rateB || 0.01)}x higher conversion` : 'Both variants performing similarly'}`,
    ],
    visitor_confusion: a.feedback.concat(b.feedback).filter(f =>
      f.toLowerCase().includes('confused') || f.toLowerCase().includes('unclear') || f.toLowerCase().includes('what')
    ),
    strongest_message: winner ? `Variant ${winner.toUpperCase()}` : 'Both equal',
    weakest_message: winner ? `Variant ${winner === 'a' ? 'B' : 'A'}` : 'Both equal',
    recommended_changes: 'Consider iterating on the winning variant with refined messaging',
    next_hypothesis: 'Combine the strongest elements from both variants',
  };
}
