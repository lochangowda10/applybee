"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Check, Copy, ExternalLink, BarChart3, Lightbulb, Users, MessageSquare, TrendingUp, Loader2, Zap, Globe, Download } from "lucide-react";
import QRCode from "qrcode";
import { humanizeError, safeJson, type FriendlyError } from "@/lib/errors";
import { ProgressStatus, ErrorNotice } from "@/components/progress-status";

// Types
interface ProductAnalysis {
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

interface PositioningHypothesis {
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
  color_scheme: { primary: string; secondary: string; accent: string };
}

interface LandingContent {
  hero: { headline: string; subheadline: string; cta: string; ctaSubtext: string };
  problem: { title: string; description: string; painPoints: string[] };
  benefits: { title: string; items: { title: string; description: string }[] };
  howItWorks: { title: string; steps: { step: number; title: string; description: string }[] };
  features: { title: string; items: { title: string; description: string; icon: string }[] };
  cta: { headline: string; subheadline: string; button: string };
}

interface VariantData {
  id: string;
  name: string;
  positioning: PositioningHypothesis;
  landingContent: LandingContent;
}

interface AnalyticsData {
  variantId: string;
  name: string;
  views: number;
  clicks: number;
  conversion: string;
  feedback: { text: string; created_at: string }[];
}

interface GrowthAnalysis {
  winner: string | null;
  confidence: string;
  observations: string[];
  visitor_confusion: string[];
  strongest_message: string;
  weakest_message: string;
  recommended_changes: string;
  next_hypothesis: string;
}

const ANALYSIS_STEPS = [
  "Reading repository",
  "Understanding architecture",
  "Finding product signals",
  "Identifying audience",
  "Building product model",
];

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  // State
  const [step, setStep] = useState<"analyzing" | "analysis" | "context" | "positioning" | "deploying" | "live" | "dashboard" | "learning">("analyzing");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [editingAnalysis, setEditingAnalysis] = useState<ProductAnalysis | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Founder context
  const [targetUser, setTargetUser] = useState("");
  const [alternative, setAlternative] = useState("");
  const [differentiation, setDifferentiation] = useState("");
  const [desiredAction, setDesiredAction] = useState("");

  // Experiments
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantData[]>([]);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});

  // Analytics
  const [analytics, setAnalytics] = useState<AnalyticsData[]>([]);

  // Growth intelligence
  const [growthAnalysis, setGrowthAnalysis] = useState<GrowthAnalysis | null>(null);
  const [learningLoading, setLearningLoading] = useState(false);

  // Loading states
  const [positioningLoading, setPositioningLoading] = useState(false);

  // Copy feedback
  const [copied, setCopied] = useState<string | null>(null);
  const [failure, setFailure] = useState<FriendlyError | null>(null);

  // Load analysis on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const cached = sessionStorage.getItem(`project_${projectId}`);
      if (cached) {
        const data = JSON.parse(cached);
        if (cancelled) return;
        setAnalysis(data.analysis);
        setEditingAnalysis(data.analysis);
        // Animate progress steps
        for (let i = 0; i <= 5; i++) {
          await new Promise(r => setTimeout(r, 400));
          if (cancelled) return;
          setAnalysisProgress(i);
        }
        setStep("analysis");
        return;
      }
      // No session cache: this is a refresh, a new tab, or a shared link.
      // Everything is already in the database, so resume from there rather
      // than stranding the user on an animation that never completes.
      if (cancelled) return;
      setStep("analyzing");
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const data = await safeJson<{
          analysis?: ProductAnalysis;
          context?: {
            target_user: string | null;
            alternative: string | null;
            differentiation: string | null;
            desired_action: string | null;
          } | null;
          experimentId?: string | null;
          variants?: VariantData[];
          error?: string;
        }>(res);

        if (cancelled) return;
        if (!res.ok || !data.analysis) {
          throw new Error(data.error || `Could not load project (${res.status})`);
        }

        setAnalysis(data.analysis);
        setEditingAnalysis(data.analysis);

        // Restore the founder's earlier answers so they are not asked twice.
        if (data.context) {
          setTargetUser(data.context.target_user ?? "");
          setAlternative(data.context.alternative ?? "");
          setDifferentiation(data.context.differentiation ?? "");
          setDesiredAction(data.context.desired_action ?? "");
        }

        setAnalysisProgress(ANALYSIS_STEPS.length);

        // If variants already exist, drop the user back into the live
        // experiment with its QR codes rather than the start of the flow.
        if (data.experimentId && data.variants && data.variants.length > 0) {
          setExperimentId(data.experimentId);
          setVariants(data.variants);

          const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
          const qrMap: Record<string, string> = {};
          qrMap["primary"] = await QRCode.toDataURL(
            `${baseUrl}/x/${data.experimentId}`,
            { width: 160, margin: 1 }
          );
          for (const v of data.variants) {
            qrMap[v.name] = await QRCode.toDataURL(
              `${baseUrl}/e/${data.experimentId}/${v.name}`,
              { width: 160, margin: 1 }
            );
          }
          if (cancelled) return;
          setQrCodes(qrMap);
          setStep("live");
          return;
        }

        setStep("analysis");
      } catch (err) {
        if (cancelled) return;
        setFailure(humanizeError(err));
        setStep("analysis");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  // Save founder context and generate positioning
  const handleContinueToPositioning = async () => {
    setFailure(null);
    setPositioningLoading(true);
    setStep("positioning");

    try {
      // Save context
      await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          targetUser,
          alternative,
          differentiation,
          desiredAction,
        }),
      });

      // Generate positioning
      const res = await fetch("/api/positioning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      const data = await safeJson<{ experimentId?: string; variants?: VariantData[]; error?: string }>(res);
      if (!res.ok || !data.experimentId || !data.variants) {
        throw new Error(data.error || `Positioning failed (${res.status})`);
      }

      setExperimentId(data.experimentId);
      setVariants(data.variants);

      // Generate QR codes - use production URL if available, else current origin
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const qrMap: Record<string, string> = {};
      // Primary QR: /x/{experimentId} (random A/B assignment)
      const primaryUrl = `${baseUrl}/x/${data.experimentId}`;
      qrMap['primary'] = await QRCode.toDataURL(primaryUrl, { width: 160, margin: 1 });
      // Individual variant QRs
      for (const v of data.variants) {
        const url = `${baseUrl}/e/${data.experimentId}/${v.name}`;
        qrMap[v.name] = await QRCode.toDataURL(url, { width: 160, margin: 1 });
      }
      setQrCodes(qrMap);

      setStep("live");
    } catch (err: unknown) {
      setFailure(humanizeError(err));
      setStep("context");
    } finally {
      setPositioningLoading(false);
    }
  };

  // Load analytics
  const loadAnalytics = async () => {
    if (!experimentId) return;
    try {
      const res = await fetch(`/api/experiments/${experimentId}/events`);
      const data = await safeJson<{ analytics?: AnalyticsData[] }>(res);
      setAnalytics(data.analytics || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Run growth intelligence
  const runGrowthAnalysis = async () => {
    if (!experimentId) return;
    setFailure(null);
    setLearningLoading(true);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/learning`, {
        method: "POST",
      });
      const data = await safeJson<{ analysis?: GrowthAnalysis; error?: string }>(res);
      if (!res.ok || !data.analysis) {
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }
      setGrowthAnalysis(data.analysis);
      setStep("learning");
    } catch (err: unknown) {
      setFailure(humanizeError(err));
    } finally {
      setLearningLoading(false);
    }
  };

  /**
   * Saves a generated QR as a PNG. The codes are already produced as data
   * URLs by the qrcode library, so this needs no round trip — it just names
   * the file something a founder can find again after the event.
   */
  const downloadQr = (dataUrl: string, label: string) => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `launchloop-${label}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Copy URL
  const copyUrl = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  // ===== RENDER =====

  // Step: Analyzing
  if (step === "analyzing") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center mx-auto mb-6">
              <Zap className="w-6 h-6 text-background" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Analyzing your product…</h1>
            <p className="text-sm text-muted-foreground">
              This usually takes 10-30 seconds
            </p>
          </div>

          <div className="space-y-3">
            {ANALYSIS_STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                {analysisProgress > i ? (
                  <div className="w-5 h-5 rounded-full bg-foreground/10 flex items-center justify-center">
                    <Check className="w-3 h-3 text-foreground" />
                  </div>
                ) : analysisProgress === i ? (
                  <div className="w-5 h-5 rounded-full border-2 border-foreground/20 border-t-foreground/60 animate-spin" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-border/60" />
                )}
                <span className={`text-sm ${analysisProgress > i ? "text-foreground" : analysisProgress === i ? "text-foreground" : "text-muted-foreground/40"}`}>
                  {s}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step: Analysis Review
  if (step === "analysis" && analysis) {
    return (
      <div className="min-h-screen pt-14">
        <nav className="fixed top-0 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl z-50">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <Zap className="w-4 h-4 text-background" />
              </div>
              <span className="text-sm font-semibold tracking-tight">LaunchLoop</span>
            </div>
            <span className="text-xs text-muted-foreground">Step 1 of 5 — Product Analysis</span>
          </div>
        </nav>

        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className="text-3xl font-bold mb-2">We think this is what you&apos;ve built.</h1>
              <p className="text-muted-foreground text-sm">
                Review our analysis. Edit anything that looks wrong.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20">
                <span className="text-xs text-muted-foreground">Confidence: </span>
                <span className="text-xs font-semibold">{Math.round((isEditing ? editingAnalysis : analysis)!.confidence * 100)}%</span>
              </div>
            </div>
          </div>

          {isEditing && editingAnalysis ? (
            <div className="space-y-6">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Product Name</label>
                <input
                  value={editingAnalysis.product_name}
                  onChange={(e) => setEditingAnalysis({ ...editingAnalysis, product_name: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Summary</label>
                <textarea
                  value={editingAnalysis.summary}
                  onChange={(e) => setEditingAnalysis({ ...editingAnalysis, summary: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Problem</label>
                <textarea
                  value={editingAnalysis.problem}
                  onChange={(e) => setEditingAnalysis({ ...editingAnalysis, problem: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target Users (comma-separated)</label>
                <input
                  value={editingAnalysis.target_users.join(", ")}
                  onChange={(e) => setEditingAnalysis({ ...editingAnalysis, target_users: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Features (comma-separated)</label>
                <input
                  value={editingAnalysis.features.join(", ")}
                  onChange={(e) => setEditingAnalysis({ ...editingAnalysis, features: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Differentiators (comma-separated)</label>
                <input
                  value={editingAnalysis.differentiators.join(", ")}
                  onChange={(e) => setEditingAnalysis({ ...editingAnalysis, differentiators: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground text-sm"
                />
              </div>
              <button
                onClick={() => {
                  setAnalysis(editingAnalysis);
                  setIsEditing(false);
                }}
                className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium"
              >
                Save Edits
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              <Card>
                <CardLabel>Product Name</CardLabel>
                <CardValue>{analysis.product_name}</CardValue>
              </Card>
              <Card>
                <CardLabel>What it does</CardLabel>
                <CardValue>{analysis.summary}</CardValue>
              </Card>
              <Card>
                <CardLabel>Problem being solved</CardLabel>
                <CardValue>{analysis.problem}</CardValue>
              </Card>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardLabel>Target Users</CardLabel>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {analysis.target_users.map((u, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-muted/50 text-xs">{u}</span>
                    ))}
                  </div>
                </Card>
                <Card>
                  <CardLabel>Confidence</CardLabel>
                  <div className="mt-1">
                    <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                      <div className="h-full bg-foreground/70 rounded-full transition-all" style={{ width: `${analysis.confidence * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground mt-1 block">{Math.round(analysis.confidence * 100)}% based on repository evidence</span>
                  </div>
                </Card>
              </div>
              <Card>
                <CardLabel>Key Capabilities</CardLabel>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {analysis.technical_capabilities.map((t, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-muted/50 text-xs">{t}</span>
                  ))}
                </div>
              </Card>
              <Card>
                <CardLabel>Evidence from Repository</CardLabel>
                <ul className="space-y-1.5 mt-1">
                  {analysis.evidence.map((e, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-foreground/40 mt-0.5">→</span>
                      {e}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          <div className="flex items-center justify-between mt-10 pt-6 border-t border-border/50">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-3">
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="h-10 px-4 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-all"
                >
                  Edit understanding
                </button>
              )}
              <button
                onClick={() => setStep("context")}
                className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2"
              >
                Looks right
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step: Founder Context
  if (step === "context") {
    return (
      <div className="min-h-screen pt-14">
        <nav className="fixed top-0 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl z-50">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <Zap className="w-4 h-4 text-background" />
              </div>
              <span className="text-sm font-semibold tracking-tight">LaunchLoop</span>
            </div>
            <span className="text-xs text-muted-foreground">Step 2 of 5 — Founder Context</span>
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-6 py-16">
          <h1 className="text-3xl font-bold mb-2">Tell us what the code cannot.</h1>
          <p className="text-muted-foreground text-sm mb-10">
            A few questions to sharpen the positioning. Be as specific as you can.
          </p>

          <div className="space-y-8">
            <Field
              label="Who needs this product the most?"
              placeholder="e.g., Solo founders shipping side projects, early-stage startups without a marketing team…"
              value={targetUser}
              onChange={setTargetUser}
            />
            <Field
              label="What do they currently use instead?"
              placeholder="e.g., Manually writing landing pages, Notion docs, Framer templates, Nothing at all…"
              value={alternative}
              onChange={setAlternative}
            />
            <Field
              label="What makes your solution better?"
              placeholder="e.g., It analyzes the actual code, not just the README. It runs experiments automatically…"
              value={differentiation}
              onChange={setDifferentiation}
            />
            <Field
              label="What action do you want visitors to take?"
              placeholder="e.g., Try it free, Sign up for beta, Star the repo, Book a demo…"
              value={desiredAction}
              onChange={setDesiredAction}
            />
          </div>

          {failure && (
            <ErrorNotice
              className="mt-8"
              message={failure.message}
              action={failure.action}
              retryable={failure.retryable}
              onRetry={() => void handleContinueToPositioning()}
            />
          )}

          <div className="flex items-center justify-between mt-10 pt-6 border-t border-border/50">
            <button
              onClick={() => setStep("analysis")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={handleContinueToPositioning}
              className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2"
            >
              {positioningLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  Generate Positioning
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step: Positioning
  if (step === "positioning" && positioningLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h2 className="mb-2 text-xl font-bold">
              Generating positioning hypotheses…
            </h2>
            <p className="text-sm text-muted-foreground">
              Writing two genuinely different ways to present your product, then
              building a landing page for each.
            </p>
          </div>
          <ProgressStatus
            className="rounded-lg border border-border bg-card p-5"
            expectedSeconds={25}
            stages={[
              "Framing the outcome-led position",
              "Framing the capability-led position",
              "Writing landing page A",
              "Writing landing page B",
              "Deploying both to live URLs",
            ]}
          />
        </div>
      </div>
    );
  }

  // Step: Live Experiments
  if (step === "live" && variants.length > 0 && experimentId) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
    const primaryUrl = `${baseUrl}/x/${experimentId}`;
    return (
      <div className="min-h-screen pt-14">
        <nav className="fixed top-0 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl z-50">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <Zap className="w-4 h-4 text-background" />
              </div>
              <span className="text-sm font-semibold tracking-tight">LaunchLoop</span>
            </div>
            <span className="text-xs text-muted-foreground">Step 3 of 5 — Experiments Live</span>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-16">
          <h1 className="text-3xl font-bold mb-2">Experiments are live.</h1>
          <p className="text-muted-foreground text-sm mb-10">
            Share this QR code with real people. Every visit is tracked.
          </p>

          {/* Primary QR - the one to share */}
          <div className="rounded-xl border border-border/60 bg-card p-8 mb-10 text-center">
            <div className="text-xs font-medium text-muted-foreground mb-4 uppercase tracking-wider">Share this QR code</div>
            <div className="flex flex-col items-center gap-4">
              {qrCodes['primary'] && (
                <div className="p-4 bg-white rounded-xl shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCodes['primary']} alt="Experiment QR code" width={180} height={180} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted/30 px-3 py-1.5 rounded-lg">{primaryUrl}</code>
                <button
                  onClick={() => copyUrl(primaryUrl, 'primary')}
                  className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  {copied === 'primary' ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>
              {qrCodes['primary'] && (
                <button
                  onClick={() => downloadQr(qrCodes['primary'], 'experiment')}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PNG
                </button>
              )}
              <p className="text-xs text-muted-foreground/60">Visitors are randomly assigned to Variant A or B</p>
            </div>
          </div>

          {/* Individual variants (secondary) */}
          <div className="text-xs font-medium text-muted-foreground mb-4 uppercase tracking-wider">Direct variant links</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {variants.map((v) => {
              const url = `${baseUrl}/e/${experimentId}/${v.name}`;
              return (
                <div key={v.id} className="rounded-xl border border-border/60 bg-card overflow-hidden">
                  <div className="h-2" style={{ background: `linear-gradient(90deg, ${v.positioning.color_scheme.primary}, ${v.positioning.color_scheme.accent})` }} />
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-muted/50">
                        Variant {v.name.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground">{v.positioning.type}</span>
                    </div>
                    <h3 className="text-lg font-semibold mb-1">&ldquo;{v.positioning.headline}&rdquo;</h3>
                    <p className="text-sm text-muted-foreground mb-4">{v.positioning.subheadline}</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted/30 px-2 py-1 rounded flex-1 truncate">{url}</code>
                      <button onClick={() => copyUrl(url, v.name)} className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
                        {copied === v.name ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                      </button>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
                        <ExternalLink className="w-4 h-4 text-muted-foreground" />
                      </a>
                    </div>

                    {qrCodes[v.name] && (
                      <div className="mt-4 flex items-center gap-4 border-t border-border/50 pt-4">
                        <div className="rounded-lg bg-white p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={qrCodes[v.name]}
                            alt={`QR code for variant ${v.name.toUpperCase()}`}
                            width={84}
                            height={84}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">
                            Sends every scan straight to variant{" "}
                            {v.name.toUpperCase()}, bypassing the split.
                          </p>
                          <button
                            onClick={() => downloadQr(qrCodes[v.name], `variant-${v.name}`)}
                            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download PNG
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-10 pt-6 border-t border-border/50">
            <button onClick={() => setStep("context")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => { loadAnalytics(); setStep("dashboard"); }}
              className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2"
            >
              Open Dashboard <BarChart3 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step: Dashboard
  if (step === "dashboard") {
    return (
      <div className="min-h-screen pt-14">
        <nav className="fixed top-0 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl z-50">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <Zap className="w-4 h-4 text-background" />
              </div>
              <span className="text-sm font-semibold tracking-tight">LaunchLoop</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">Step 4 of 5 — Growth Dashboard</span>
              <button
                onClick={loadAnalytics}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-16">
          <h1 className="text-3xl font-bold mb-2">Live Growth Dashboard</h1>
          <p className="text-muted-foreground text-sm mb-10">
            Real data from real visitors. No faking.
          </p>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="Total Views"
              value={analytics.reduce((s, a) => s + a.views, 0).toString()}
            />
            <StatCard
              icon={<BarChart3 className="w-4 h-4" />}
              label="CTA Clicks"
              value={analytics.reduce((s, a) => s + a.clicks, 0).toString()}
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Overall Conv."
              value={`${analytics.reduce((s, a) => s + a.views, 0) > 0
                ? ((analytics.reduce((s, a) => s + a.clicks, 0) / analytics.reduce((s, a) => s + a.views, 0)) * 100).toFixed(1)
                : "0.0"
              }%`}
            />
            <StatCard
              icon={<MessageSquare className="w-4 h-4" />}
              label="Feedback"
              value={analytics.reduce((s, a) => s + a.feedback.length, 0).toString()}
            />
          </div>

          {/* Variant Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {analytics.map((a) => {
              const variant = variants.find(v => v.name === a.name);
              return (
                <div key={a.variantId} className="rounded-xl border border-border/60 bg-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-muted/50">
                      Variant {a.name.toUpperCase()}
                    </span>
                    {variant && (
                      <span className="text-xs text-muted-foreground truncate">{variant.positioning.type}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-2xl font-bold">{a.views}</div>
                      <div className="text-xs text-muted-foreground">Views</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{a.clicks}</div>
                      <div className="text-xs text-muted-foreground">Clicks</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{a.conversion}%</div>
                      <div className="text-xs text-muted-foreground">Conversion</div>
                    </div>
                  </div>

                  {/* Conversion bar */}
                  <div className="h-2 rounded-full bg-muted/30 overflow-hidden mb-4">
                    <div
                      className="h-full bg-foreground/60 rounded-full transition-all"
                      style={{ width: `${Math.min(parseFloat(a.conversion), 100)}%` }}
                    />
                  </div>

                  {a.feedback.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">Recent Feedback</div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {a.feedback.slice(0, 3).map((f, i) => (
                          <div key={i} className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2">
                            &ldquo;{f.text}&rdquo;
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {analytics.every(a => a.views === 0) && (
            <div className="text-center py-12 rounded-xl border border-border/40 bg-muted/10">
              <Globe className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No visitors yet. Share the experiment URLs to start collecting data.</p>
              <button
                onClick={() => setStep("live")}
                className="mt-4 text-sm text-foreground underline underline-offset-4 hover:opacity-70 transition-opacity"
              >
                Back to experiment URLs
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mt-10 pt-6 border-t border-border/50">
            <button
              onClick={() => setStep("live")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={runGrowthAnalysis}
              disabled={learningLoading}
              className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2"
            >
              {learningLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Lightbulb className="w-4 h-4" />
                  What did we learn?
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step: Learning
  if (step === "learning" && growthAnalysis) {
    return (
      <div className="min-h-screen pt-14">
        <nav className="fixed top-0 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl z-50">
          <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <Zap className="w-4 h-4 text-background" />
              </div>
              <span className="text-sm font-semibold tracking-tight">LaunchLoop</span>
            </div>
            <span className="text-xs text-muted-foreground">Step 5 of 5 — Growth Intelligence</span>
          </div>
        </nav>

        <div className="max-w-3xl mx-auto px-6 py-16">
          <h1 className="text-3xl font-bold mb-2">What did we learn?</h1>
          <p className="text-muted-foreground text-sm mb-10">
            AI analysis of your experiment results and feedback.
          </p>

          {/* Iteration Timeline */}
          <div className="mb-10">
            <h2 className="text-sm font-medium text-muted-foreground mb-4">Iteration Timeline</h2>
            <div className="space-y-4">
              {variants.map((v) => {
                const a = analytics.find(x => x.name === v.name);
                return (
                  <div key={v.id} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center text-xs font-bold shrink-0">
                      {v.name.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">&ldquo;{v.positioning.headline}&rdquo;</p>
                      <p className="text-xs text-muted-foreground">
                        {a?.views || 0} views · {a?.clicks || 0} clicks
                      </p>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
                  <Lightbulb className="w-4 h-4 text-foreground/60" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">AI Learning</p>
                  <p className="text-sm text-muted-foreground mt-1">{growthAnalysis.recommended_changes}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center text-xs font-bold text-background shrink-0">
                  C
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{growthAnalysis.next_hypothesis}</p>
                  <p className="text-xs text-muted-foreground mt-1">Next iteration hypothesis</p>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Analysis */}
          <div className="space-y-6">
            {growthAnalysis.winner && (
              <div className="rounded-xl border border-border/60 bg-card p-6">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium">Winner</span>
                </div>
                <p className="text-lg font-semibold">Variant {growthAnalysis.winner.toUpperCase()}</p>
                <p className="text-sm text-muted-foreground mt-1">{growthAnalysis.confidence}</p>
              </div>
            )}

            <Card>
              <CardLabel>Confidence Assessment</CardLabel>
              <CardValue>{growthAnalysis.confidence}</CardValue>
            </Card>

            <Card>
              <CardLabel>Key Observations</CardLabel>
              <ul className="space-y-2 mt-1">
                {growthAnalysis.observations.map((o, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-foreground/40 mt-0.5">→</span>
                    {o}
                  </li>
                ))}
              </ul>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardLabel>Strongest Message</CardLabel>
                <CardValue>{growthAnalysis.strongest_message}</CardValue>
              </Card>
              <Card>
                <CardLabel>Weakest Message</CardLabel>
                <CardValue>{growthAnalysis.weakest_message}</CardValue>
              </Card>
            </div>

            {growthAnalysis.visitor_confusion.length > 0 && (
              <Card>
                <CardLabel>Visitor Confusion</CardLabel>
                <ul className="space-y-2 mt-1">
                  {growthAnalysis.visitor_confusion.map((c, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-foreground/40 mt-0.5">?</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <CardLabel>Recommended Changes</CardLabel>
              <CardValue>{growthAnalysis.recommended_changes}</CardValue>
            </Card>

            <div className="rounded-xl border border-foreground/20 bg-foreground/5 p-6">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-foreground/60" />
                <span className="text-sm font-medium">Next Hypothesis</span>
              </div>
              <p className="text-lg font-semibold">{growthAnalysis.next_hypothesis}</p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-10 pt-6 border-t border-border/50">
            <button
              onClick={() => setStep("dashboard")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>
            <button
              onClick={() => {
                // Store the next hypothesis and potentially generate Version C
                alert("Version C generation would create a new experiment based on the AI learning above. In the full version, this would trigger a new positioning + landing page cycle.");
              }}
              className="h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2"
            >
              Generate Version C
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}

// ===== Small Components =====

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-muted-foreground mb-1">{children}</div>;
}

function CardValue({ children }: { children: React.ReactNode }) {
  return <div className="text-sm">{children}</div>;
}

function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium mb-2 block">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
