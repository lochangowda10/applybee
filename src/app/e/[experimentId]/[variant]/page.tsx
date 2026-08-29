"use client";

import { useState, useEffect, useCallback, use } from "react";
import { Check, ArrowRight, Loader2 } from "lucide-react";

interface LandingContent {
  hero: { headline: string; subheadline: string; cta: string; ctaSubtext: string };
  problem: { title: string; description: string; painPoints: string[] };
  benefits: { title: string; items: { title: string; description: string }[] };
  howItWorks: { title: string; steps: { step: number; title: string; description: string }[] };
  features: { title: string; items: { title: string; description: string; icon: string }[] };
  cta: { headline: string; subheadline: string; button: string };
}

interface PositioningHypothesis {
  id: string;
  headline: string;
  subheadline: string;
  color_scheme: { primary: string; secondary: string; accent: string };
}

interface VariantData {
  id: string;
  name: string;
  positioning: PositioningHypothesis;
  landingContent: LandingContent;
}

export default function ExperimentPage({
  params,
}: {
  params: Promise<{ experimentId: string; variant: string }>;
}) {
  const { experimentId, variant } = use(params);
  const [variantData, setVariantData] = useState<VariantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [ctaClicked, setCtaClicked] = useState(false);

  // Generate or retrieve session ID
  const getSessionId = useCallback(() => {
    if (typeof window === "undefined") return "";
    let sid = sessionStorage.getItem("ll_session_id");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("ll_session_id", sid);
    }
    return sid;
  }, []);

  // Load variant data from API
  useEffect(() => {
    async function load() {
      try {
        // Fetch experiment data via a lightweight endpoint
        // We'll use the events endpoint which returns variant info
        const res = await fetch(`/api/experiments/${experimentId}/events`);
        if (!res.ok) throw new Error("Experiment not found");

        // We need the actual variant data with landing content
        // Let's use a dedicated endpoint
        const variantRes = await fetch(`/api/experiments/${experimentId}/variant?name=${variant}`);
        if (!variantRes.ok) throw new Error("Variant not found");
        const data = await variantRes.json();
        setVariantData(data.variant);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [experimentId, variant]);

  // Track page view on mount
  useEffect(() => {
    if (!variantData) return;
    const sid = getSessionId();
    fetch(`/api/experiments/${experimentId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId: variantData.id,
        eventType: "page_view",
        sessionId: sid,
      }),
    });
  }, [variantData, experimentId, getSessionId]);

  // Track CTA click
  const handleCtaClick = () => {
    if (!variantData || ctaClicked) return;
    setCtaClicked(true);
    const sid = getSessionId();
    fetch(`/api/experiments/${experimentId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId: variantData.id,
        eventType: "cta_click",
        sessionId: sid,
      }),
    });
  };

  // Submit feedback
  const handleFeedback = async () => {
    if (!variantData || !feedback.trim()) return;
    try {
      await fetch(`/api/experiments/${experimentId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: variantData.id,
          text: feedback.trim(),
        }),
      });
      setFeedbackSubmitted(true);
      setFeedback("");
    } catch {
      // Silent fail for feedback
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !variantData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Experiment not found</h1>
          <p className="text-muted-foreground">{error || "This experiment may have been removed."}</p>
        </div>
      </div>
    );
  }

  const content = variantData.landingContent;
  const colors = variantData.positioning.color_scheme;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative min-h-[85vh] flex items-center justify-center px-6 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% -20%, ${colors.accent}, transparent)`,
          }}
        />

        <div className="relative max-w-3xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs mb-8"
            style={{ borderColor: `${colors.accent}33` }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: colors.accent }} />
            Live experiment
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            {content.hero.headline}
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
            {content.hero.subheadline}
          </p>

          <button
            onClick={handleCtaClick}
            className="h-12 px-8 rounded-xl text-sm font-semibold transition-all hover:opacity-90 inline-flex items-center gap-2"
            style={{
              background: colors.accent,
              color: "#fff",
            }}
          >
            {ctaClicked ? (
              <>
                <Check className="w-4 h-4" />
                Thanks!
              </>
            ) : (
              <>
                {content.hero.cta}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
          <p className="text-xs text-muted-foreground/60 mt-3">{content.hero.ctaSubtext}</p>
        </div>
      </section>

      {/* Problem */}
      <section className="py-24 px-6 border-t border-border/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">{content.problem.title}</h2>
          <p className="text-muted-foreground leading-relaxed mb-8">{content.problem.description}</p>
          <div className="space-y-3">
            {content.problem.painPoints.map((p, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-md bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-destructive text-xs font-bold">{i + 1}</span>
                </div>
                <span className="text-sm">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 px-6 border-t border-border/50 bg-muted/10">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">{content.benefits.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {content.benefits.items.map((b, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-card p-6">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{ background: `${colors.accent}15` }}
                >
                  <span className="text-lg">{["✦", "◆", "●"][i]}</span>
                </div>
                <h3 className="font-semibold mb-2">{b.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 border-t border-border/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">{content.howItWorks.title}</h2>
          <div className="space-y-8">
            {content.howItWorks.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-6">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                  style={{ background: `${colors.accent}15`, color: colors.accent }}
                >
                  {s.step}
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6 border-t border-border/50 bg-muted/10">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-12 text-center">{content.features.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {content.features.items.map((f, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-border/40">
                <span className="text-xl">{f.icon}</span>
                <div>
                  <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6 border-t border-border/50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">{content.cta.headline}</h2>
          <p className="text-muted-foreground mb-8">{content.cta.subheadline}</p>
          <button
            onClick={handleCtaClick}
            className="h-12 px-8 rounded-xl text-sm font-semibold transition-all hover:opacity-90 inline-flex items-center gap-2"
            style={{ background: colors.accent, color: "#fff" }}
          >
            {content.cta.button}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Feedback */}
      <section className="py-16 px-6 border-t border-border/50 bg-muted/5">
        <div className="max-w-lg mx-auto text-center">
          {feedbackSubmitted ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Check className="w-4 h-4 text-green-500" />
              Thanks for your feedback!
            </div>
          ) : (
            <>
              <p className="text-sm font-medium mb-3">What would stop you from trying this product?</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Your honest thoughts…"
                  className="flex-1 h-10 px-4 rounded-lg border border-border bg-card text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFeedback();
                  }}
                />
                <button
                  onClick={handleFeedback}
                  disabled={!feedback.trim()}
                  className="h-10 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 px-6 border-t border-border/50">
        <div className="text-center text-xs text-muted-foreground/40">
          Powered by LaunchLoop AI — This is an experiment
        </div>
      </footer>
    </div>
  );
}
