"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GitBranch, Globe, Zap, BarChart3, Repeat, Sparkles, Check } from "lucide-react";
import { humanizeError, safeJson, type FriendlyError } from "@/lib/errors";
import { ProgressStatus, ErrorNotice } from "@/components/progress-status";

/** The marker never changes mid-visit, so there is nothing to subscribe to. */
function subscribeToReferrer(): () => void {
  return () => {};
}

/** URL first, then the persisted copy. Returns a stable string across renders. */
function readReferrer(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    if (fromUrl) return fromUrl;
    return sessionStorage.getItem("ll_ref");
  } catch {
    return null;
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const router = useRouter();

  // The referral marker lives in the URL and sessionStorage — an external
  // store — so it is read through useSyncExternalStore rather than copied into
  // React state inside an effect. It never changes during a visit, so the
  // subscribe function has nothing to listen for.
  const referrer = useSyncExternalStore(
    subscribeToReferrer,
    readReferrer,
    () => null
  );

  // Persist ?ref= so it survives the visitor navigating on before they start
  // a project. This updates an external system and sets no state.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    if (!fromUrl) return;
    try {
      sessionStorage.setItem("ll_ref", fromUrl);
    } catch {
      // Storage unavailable (private mode); the URL value still works.
    }
  }, []);

  const runAnalysis = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const isGitHub = url.includes("github.com");
      const body: Record<string, string> = isGitHub
        ? { repoUrl: url }
        : { productUrl: url };
      if (referrer) body.ref = referrer;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Parse defensively: a 500 or a gateway error returns HTML, and calling
      // .json() on that throws a parser error that means nothing to a user.
      const data = await safeJson<{ projectId?: string; error?: string }>(res);
      if (!res.ok || !data.projectId) {
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }

      sessionStorage.setItem(`project_${data.projectId}`, JSON.stringify(data));
      router.push(`/project/${data.projectId}`);
    } catch (err: unknown) {
      setError(humanizeError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runAnalysis();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
              <Zap className="w-4 h-4 text-background" />
            </div>
            <span className="text-sm font-semibold tracking-tight">LaunchLoop</span>
          </div>
          <div className="text-xs text-muted-foreground">
            THE HIVE / ApplyBee AI Hackathon 2026
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="pt-14">
        <section className="relative min-h-[90vh] flex items-center justify-center px-6">
          {/* Subtle gradient */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_45%_at_50%_-15%,color-mix(in_oklch,var(--accent)_14%,transparent),transparent)]" />

          <div className="rise relative mx-auto max-w-3xl text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-muted/30 text-xs text-muted-foreground mb-8">
              <Sparkles className="w-3.5 h-3.5" />
              Autonomous AI Growth Engineer
            </div>

            {/* Headline */}
            <h1 className="display mb-6 text-balance text-[clamp(2.4rem,8vw,5rem)]">
              Nobody understands
              <br />
              <span className="text-muted-foreground">what you built.</span>
            </h1>

            {/* Subtitle */}
            <p className="mx-auto mb-10 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              LaunchLoop writes two opposing positions for your product, deploys
              both as real landing pages, and lets actual visitors tell you which
              one lands — and what they misread.
            </p>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="max-w-xl mx-auto">
              <div className="relative flex items-center">
                <div className="absolute left-4 text-muted-foreground">
                  {url.includes("github.com") ? (
                    <GitBranch className="w-5 h-5" />
                  ) : (
                    <Globe className="w-5 h-5" />
                  )}
                </div>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/user/project"
                  className="w-full h-14 pl-12 pr-36 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !url.trim()}
                  className="absolute right-2 h-10 px-5 rounded-lg bg-foreground text-background text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      Analyze Product
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
              {loading && (
                <ProgressStatus
                  className="mt-5 rounded-lg border border-border bg-card p-4 text-left"
                  expectedSeconds={12}
                  stages={[
                    "Fetching the repository",
                    "Reading the file tree",
                    "Extracting key files",
                    "Working out what the product does",
                  ]}
                />
              )}
              {error && !loading && (
                <ErrorNotice
                  className="mt-4"
                  message={error.message}
                  action={error.action}
                  retryable={error.retryable}
                  onRetry={() => void runAnalysis()}
                />
              )}
            </form>

            <p className="text-xs text-muted-foreground/60 mt-4">
              Supports public GitHub repositories and deployed product URLs
            </p>
            {referrer && (
              <p className="mt-2 text-xs text-muted-foreground/60">
                You arrived from a page LaunchLoop wrote. We will credit it.
              </p>
            )}
          </div>
        </section>

        {/* How it works */}
        <section className="py-24 px-6 border-t border-border/50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-16">How it works</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {[
                {
                  icon: <GitBranch className="w-5 h-5" />,
                  title: "Ingest",
                  desc: "We inspect your repo — README, code, dependencies, routes — not just surface metadata.",
                },
                {
                  icon: <Sparkles className="w-5 h-5" />,
                  title: "Position",
                  desc: "AI generates two fundamentally different ways to present your product to the world.",
                },
                {
                  icon: <Globe className="w-5 h-5" />,
                  title: "Deploy",
                  desc: "Each hypothesis becomes a live landing page with its own URL and QR code.",
                },
                {
                  icon: <BarChart3 className="w-5 h-5" />,
                  title: "Learn",
                  desc: "Track real visitor behavior, collect feedback, and let AI generate the next iteration.",
                },
              ].map((step, i) => (
                <div key={i} className="relative">
                  <div className="w-10 h-10 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center text-muted-foreground mb-4">
                    {step.icon}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground/60 mb-2">
                    Step {String(i + 1).padStart(2, "0")}
                  </div>
                  <h3 className="font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closed loop */}
        <section className="py-24 px-6 border-t border-border/50">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-muted/30 text-xs text-muted-foreground mb-6">
              <Repeat className="w-3.5 h-3.5" />
              Closed Feedback Loop
            </div>
            <h2 className="display mb-5 text-balance text-[clamp(1.8rem,5vw,2.8rem)]">
              Not just generation. Continuous improvement.
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
              LaunchLoop observes real visitors, forms hypotheses, deploys experiments,
              measures results, learns, and generates improved iterations automatically.
              This is what separates it from a one-shot AI page generator.
            </p>
            <div className="flex items-center justify-center gap-3 mt-10 text-sm text-muted-foreground">
              <span className="px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20">Observe</span>
              <span>→</span>
              <span className="px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20">Hypothesize</span>
              <span>→</span>
              <span className="px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20">Deploy</span>
              <span>→</span>
              <span className="px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20">Measure</span>
              <span>→</span>
              <span className="px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20">Learn</span>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 px-6 border-t border-border/50">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="display mb-5 text-balance text-[clamp(1.8rem,5vw,2.8rem)]">Priced per experiment</h2>
              <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
                You pay when you learn something, not for a seat you forgot you
                had. One experiment is two positions, two live pages, and the
                rewrite that comes out of real visitor behaviour.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {[
                {
                  name: "First one free",
                  price: "$0",
                  unit: "1 experiment",
                  per: "no card required",
                  points: [
                    "Full loop, nothing withheld",
                    "Two live variant URLs + QR codes",
                    "The proposed rewrite",
                  ],
                  featured: false,
                },
                {
                  name: "Starter",
                  price: "$19",
                  unit: "10 experiments",
                  per: "$1.90 each",
                  points: [
                    "Everything in Free",
                    "Experiments never expire",
                    "Referral attribution",
                  ],
                  featured: true,
                },
                {
                  name: "Growth",
                  price: "$79",
                  unit: "50 experiments",
                  per: "$1.58 each",
                  points: [
                    "Everything in Starter",
                    "Priority generation",
                    "Export results as CSV",
                  ],
                  featured: false,
                },
              ].map((t) => (
                <div
                  key={t.name}
                  className={`rounded-xl border p-6 flex flex-col ${
                    t.featured
                      ? "border-foreground/30 bg-muted/30"
                      : "border-border/60"
                  }`}
                >
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums">
                      {t.price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      / {t.unit}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.per}
                  </div>
                  <ul className="mt-6 space-y-2 flex-1">
                    {t.points.map((pt) => (
                      <li
                        key={pt}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Unit economics — every figure here is measured, not modelled. */}
            <div className="mt-8 rounded-xl border border-border/60 p-6">
              <h3 className="text-sm font-medium">
                Why this price works, in numbers we measured
              </h3>
              <div className="mt-5 grid gap-6 sm:grid-cols-3">
                <div>
                  <div className="text-2xl font-bold tabular-nums">10,467</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Tokens consumed by one complete experiment — five model
                    calls, measured end to end. At nano-tier rates that is a
                    fraction of a cent, so gross margin per experiment is above
                    99%.
                  </p>
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums">49s</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Median time from pasted link to two deployed pages across
                    our four-case test run. The manual version of this job — two
                    positions, two pages, an A/B split — is most of a working
                    day.
                  </p>
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums">$0</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Paid acquisition. Every generated page footer links back
                    with referral attribution, so each experiment a founder
                    shares is a distribution surface rather than a cost.
                  </p>
                </div>
              </div>
              <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
                The comparison is not another AI tool. It is a positioning
                consultant at four figures an engagement, or a copywriter per
                landing page, neither of which tells you what actual visitors
                misunderstood. $1.90 buys the answer.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 px-6 border-t border-border/50">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 text-xs text-muted-foreground/60 sm:flex-row sm:items-center sm:justify-between">
            <span>LaunchLoop AI — THE HIVE / ApplyBee Hackathon 2026</span>
            <nav className="flex items-center gap-5">
              <a href="/demo" className="transition-colors hover:text-foreground">
                Recorded run
              </a>
              <a href="/referrals" className="transition-colors hover:text-foreground">
                Referral chain
              </a>
              <a href="#pricing" className="transition-colors hover:text-foreground">
                Pricing
              </a>
            </nav>
          </div>
        </footer>
      </main>
    </div>
  );
}
