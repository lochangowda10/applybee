"use client";

import { Fragment, useState, useEffect, useCallback, use } from "react";
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
  /**
   * Which of the two opposing framings this variant argues. It drives the
   * page's structure, not just its words — see SECTION_ORDER.
   */
  type?: "outcome-pain" | "capability-transformation";
  color_scheme: { primary: string; secondary: string; accent: string };
}

interface VariantData {
  id: string;
  name: string;
  positioning: PositioningHypothesis;
  landingContent: LandingContent;
  /** Where the call to action sends people. Null when nothing was deployed. */
  destination?: string | null;
}

/**
 * Picks black or white for text sitting on an arbitrary background.
 *
 * The accent colour is chosen by the model, not by us, so a hardcoded white
 * label fails badly on the lighter greens and ambers it likes to produce.
 * Uses the WCAG relative-luminance formula rather than a naive average.
 */
function readableOn(hex: string): string {
  const m = /^#?([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})$/.exec(
    (hex ?? "").trim()
  );
  if (!m) return "#0a0a0a";
  const channel = (v: string) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L =
    0.2126 * channel(m[1]) + 0.7152 * channel(m[2]) + 0.0722 * channel(m[3]);
  // Compare the actual WCAG contrast ratios rather than guessing a lightness
  // threshold: against amber, a naive cut-off picks white at roughly 2.1:1
  // where black scores 9.6:1.
  const againstWhite = 1.05 / (L + 0.05);
  const againstBlack = (L + 0.05) / 0.05;
  return againstBlack >= againstWhite ? "#0a0a0a" : "#ffffff";
}

/**
 * The call to action.
 *
 * Renders a real link whenever the project has somewhere to send people — the
 * deployed product, or the repository it was read from. It opens in a new tab
 * deliberately: the visitor still has a question to answer further down this
 * page, and navigating away loses the written answer the experiment exists to
 * collect.
 *
 * When the founder only described their product there is genuinely nowhere to
 * go, so it stays a button and acknowledges the click instead. Either way the
 * click is recorded first, so the metric counts the same thing on both paths.
 */
function Cta({
  label,
  destination,
  accent,
  onActivate,
  confirmed,
}: {
  label: string;
  destination: string | null;
  accent: string;
  onActivate: () => void;
  confirmed?: boolean;
}) {
  const className =
    "h-12 px-8 rounded-xl text-sm font-semibold transition-all hover:opacity-90 inline-flex items-center gap-2";
  const style = { background: accent, color: readableOn(accent) };

  // Only the dead-end button needs to confirm the click, because on that path
  // nothing else visibly happens. A link that opened a tab has already shown
  // the visitor something, and should stay clickable.
  if (confirmed && !destination) {
    return (
      <span className={className} style={style}>
        <Check className="w-4 h-4" />
        Thanks!
      </span>
    );
  }

  if (destination) {
    return (
      <a
        href={destination}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onActivate}
        className={className}
        style={style}
      >
        {label}
        <ArrowRight className="w-4 h-4" />
      </a>
    );
  }

  return (
    <button onClick={onActivate} className={className} style={style}>
      {label}
      <ArrowRight className="w-4 h-4" />
    </button>
  );
}

/**
 * Section order, derived from the hypothesis rather than fixed.
 *
 * Two variants that differ only in wording are not really two variants: the
 * visitor meets the same page twice in different paint, and the experiment can
 * only ever measure copy. The order below is the structural half of each
 * argument.
 *
 * An outcome-pain variant argues from the wound, so it opens on the problem
 * and reaches the machinery last. A capability-transformation variant argues
 * from what the thing can do, so it opens on the capabilities and lands on the
 * pain only once the reader knows what is on offer. Both orders are honest
 * presentations of the same product — which is exactly what makes the
 * comparison worth running.
 */
const SECTION_ORDER = {
  "outcome-pain": ["problem", "benefits", "howItWorks", "features"],
  "capability-transformation": ["features", "howItWorks", "benefits", "problem"],
} as const;

type SectionKey = (typeof SECTION_ORDER)["outcome-pain"][number];

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
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackFailed, setFeedbackFailed] = useState(false);
  const [ctaClicked, setCtaClicked] = useState(false);

  /**
   * A stable id for this visitor, used to count one person once.
   *
   * Guarded because this page is opened by strangers on their own phones, and
   * a browser in private mode throws on the first sessionStorage access. An
   * unguarded throw here would replace the product page with an error screen
   * for a visitor who will not try a second time. Without storage they still
   * get a page and still count — they just count as a new person if they
   * reload, which is a far smaller loss than losing them entirely.
   */
  const getSessionId = useCallback(() => {
    if (typeof window === "undefined") return "";
    try {
      let sid = sessionStorage.getItem("ll_session_id");
      if (!sid) {
        sid = crypto.randomUUID();
        sessionStorage.setItem("ll_session_id", sid);
      }
      return sid;
    } catch {
      return crypto.randomUUID();
    }
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

  /**
   * Sends the visitor's answer.
   *
   * The success state used to be set whether or not the request succeeded, so
   * a dropped response showed the same thank-you as a saved one. That is the
   * worst available outcome for this product specifically: the written answers
   * are the qualitative half of the result, and silently losing them while
   * telling the visitor it worked would corrupt the finding and hide it.
   */
  const handleFeedback = async () => {
    if (!variantData || !feedback.trim() || feedbackSending) return;
    setFeedbackSending(true);
    setFeedbackFailed(false);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: variantData.id,
          text: feedback.trim(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFeedbackSubmitted(true);
      setFeedback("");
    } catch {
      // Keep what they typed, so retrying does not mean typing it again.
      setFeedbackFailed(true);
    } finally {
      setFeedbackSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          <p className="label mt-4">Loading experiment</p>
        </div>
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
  const destination = variantData.destination ?? null;

  /**
   * Each section, unchanged in design, keyed so the order above can arrange
   * them. The tint is passed in rather than baked in: it marks alternating
   * bands down the page, and a reordered page must still stripe correctly.
   */
  const sections: Record<SectionKey, (tone: string) => React.ReactNode> = {
    problem: (tone: string) => (
      <section className={`border-t border-border/50 px-5 py-16 sm:px-6 sm:py-24 ${tone}`}>
            <div className="max-w-3xl mx-auto">
              <h2 className="display mb-5 text-balance text-[clamp(1.6rem,4.5vw,2.5rem)]">{content.problem.title}</h2>
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
    ),
    benefits: (tone: string) => (
      <section className={`border-t border-border/50 px-5 py-16 sm:px-6 sm:py-24 ${tone}`}>
            <div className="max-w-4xl mx-auto">
              <h2 className="display mb-12 text-balance text-center text-[clamp(1.6rem,4.5vw,2.5rem)]">{content.benefits.title}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {content.benefits.items.map((b, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-card p-6">
                    <div
                      className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg font-mono text-xs tabular-nums"
                      style={{ background: `${colors.accent}1a`, color: colors.accent }}
                      aria-hidden="true"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <h3 className="font-semibold mb-2">{b.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{b.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
    ),
    howItWorks: (tone: string) => (
      <section className={`border-t border-border/50 px-5 py-16 sm:px-6 sm:py-24 ${tone}`}>
            <div className="max-w-3xl mx-auto">
              <h2 className="display mb-12 text-balance text-center text-[clamp(1.6rem,4.5vw,2.5rem)]">{content.howItWorks.title}</h2>
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
    ),
    features: (tone: string) => (
      <section className={`border-t border-border/50 px-5 py-16 sm:px-6 sm:py-24 ${tone}`}>
            <div className="max-w-4xl mx-auto">
              <h2 className="display mb-12 text-balance text-center text-[clamp(1.6rem,4.5vw,2.5rem)]">{content.features.title}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {content.features.items.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-4 rounded-xl border border-border/40 p-5 transition-colors hover:border-border"
                  >
                    {/* The model returns icon *names* such as "database-lock",
                        which previously rendered as literal text in the card.
                        A numbered accent marker is honest and stays on-brand. */}
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] tabular-nums"
                      style={{ background: `${colors.accent}1a`, color: colors.accent }}
                      aria-hidden="true"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <h3 className="mb-1 text-sm font-semibold">{f.title}</h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
    ),
  };

  const order =
    SECTION_ORDER[variantData.positioning.type ?? "outcome-pain"] ??
    SECTION_ORDER["outcome-pain"];

  /**
   * The hero carries the same split. A centred hero is a declaration; a
   * left-aligned one reads as the opening line of an argument. Pinning it to
   * the hypothesis means the two variants differ on sight, before anyone has
   * read a word — which is the difference between two positionings and one
   * page in two colours.
   */
  const leadsWithCapability =
    variantData.positioning.type === "capability-transformation";

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative flex min-h-[88vh] items-center justify-center overflow-hidden px-5 py-20 sm:px-6">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% -20%, ${colors.accent}, transparent)`,
          }}
        />

        <div
          className={
            leadsWithCapability
              ? "rise relative mx-auto w-full max-w-4xl text-left"
              : "rise relative mx-auto max-w-3xl text-center"
          }
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs mb-8"
            style={{ borderColor: `${colors.accent}33` }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: colors.accent }} />
            Live experiment
          </div>

          {/* Headlines are model-written and vary wildly in length, so the
              scale is fluid rather than stepped: a 14-word headline must not
              overflow a phone. */}
          <h1 className="display mb-6 text-balance text-[clamp(2.1rem,7.5vw,4.5rem)]">
            {content.hero.headline}
          </h1>
          <p
            className={`mb-10 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg ${
              leadsWithCapability ? "" : "mx-auto"
            }`}
          >
            {content.hero.subheadline}
          </p>

          <Cta
            label={content.hero.cta}
            destination={destination}
            accent={colors.accent}
            onActivate={handleCtaClick}
            confirmed={ctaClicked}
          />
          <p className="text-xs text-muted-foreground/60 mt-3">{content.hero.ctaSubtext}</p>
        </div>
      </section>

      {/* Body sections, ordered by what this variant argues. */}
      {order.map((key, i) => (
        <Fragment key={key}>{sections[key](i % 2 === 1 ? "bg-muted/10" : "")}</Fragment>
      ))}

      {/* Final CTA */}
      <section className="border-t border-border/50 px-5 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="display mb-5 text-balance text-[clamp(1.7rem,5vw,2.9rem)]">{content.cta.headline}</h2>
          <p className="text-muted-foreground mb-8">{content.cta.subheadline}</p>
          <Cta
            label={content.cta.button}
            destination={destination}
            accent={colors.accent}
            onActivate={handleCtaClick}
          />
        </div>
      </section>

      {/* Feedback */}
      <section className="border-t border-border/50 bg-muted/5 px-5 py-14 sm:px-6 sm:py-16">
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
                  disabled={!feedback.trim() || feedbackSending}
                  className="h-10 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-40"
                >
                  {feedbackSending ? "Sending…" : "Send"}
                </button>
              </div>
              {feedbackFailed && (
                <p className="mt-3 text-xs text-muted-foreground">
                  That didn&rsquo;t send. Your answer is still here — try again.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Footer — carries referral attribution. Every generated page is a
          distribution surface: the ref identifies the exact variant a new
          visitor arrived through, so the chain can be reconstructed later. */}
      <footer className="py-6 px-6 border-t border-border/50">
        <div className="text-center text-xs text-muted-foreground/40">
          This page was written and deployed by{" "}
          <a
            href={`/?ref=${variantData.id}`}
            className="underline underline-offset-4 transition-colors hover:text-muted-foreground"
          >
            LaunchLoop AI
          </a>
          {" "}— it is a live positioning experiment.
        </div>
      </footer>
    </div>
  );
}
