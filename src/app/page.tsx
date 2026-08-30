"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GitBranch, Globe, Zap, BarChart3, Repeat, Sparkles } from "lucide-react";
import { humanizeError, safeJson, type FriendlyError } from "@/lib/errors";
import { ProgressStatus, ErrorNotice } from "@/components/progress-status";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const router = useRouter();

  const runAnalysis = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const isGitHub = url.includes("github.com");
      const body = isGitHub ? { repoUrl: url } : { productUrl: url };

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
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />

          <div className="relative max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-muted/30 text-xs text-muted-foreground mb-8">
              <Sparkles className="w-3.5 h-3.5" />
              Autonomous AI Growth Engineer
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
              Paste your repo.
              <br />
              <span className="text-muted-foreground">We&apos;ll make people care.</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
              LaunchLoop analyzes your product, generates competing landing page experiments,
              deploys them live, and learns from real visitor behavior.
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
            <h2 className="text-3xl font-bold mb-4">
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

        {/* Footer */}
        <footer className="py-8 px-6 border-t border-border/50">
          <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-muted-foreground/60">
            <span>LaunchLoop AI — THE HIVE / ApplyBee Hackathon 2026</span>
            <span>Built to ship, not to demo.</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
