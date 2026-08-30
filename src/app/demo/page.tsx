import Link from "next/link";
import { db } from "@/lib/db";
import { ensureDemoSeed, DEMO_EXPERIMENT_ID } from "@/lib/demo/seed";
import { DEMO_SNAPSHOT, DEMO_LEARNING, DEMO_V3 } from "@/lib/demo/snapshot";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "LaunchLoop — Recorded run: SwingLens",
  description:
    "A complete positioning experiment, from repo to rewrite, with real visitor data.",
};

type Counts = { views: number; clicks: number; feedback: string[] };

/**
 * Reads the demo experiment with the same queries the live dashboard uses.
 * Nothing is special-cased for /demo, so the numbers here are a real aggregate
 * over real rows. If the database is unreachable we fall back to the frozen
 * snapshot, because a route whose whole job is to survive a failed demo must
 * not itself depend on the network.
 */
async function loadResults(): Promise<{ a: Counts; b: Counts; live: boolean }> {
  try {
    await ensureDemoSeed();

    const events = await db<{ name: string; event_type: string; c: number }>`
      SELECT v.name, e.event_type, COUNT(*)::int AS c
      FROM analytics_events e
      JOIN variants v ON v.id = e.variant_id
      WHERE e.experiment_id = ${DEMO_EXPERIMENT_ID}
      GROUP BY v.name, e.event_type
    `;
    const fb = await db<{ name: string; text: string }>`
      SELECT v.name, f.text
      FROM feedback f
      JOIN variants v ON v.id = f.variant_id
      WHERE f.experiment_id = ${DEMO_EXPERIMENT_ID}
      ORDER BY f.created_at
    `;

    const pick = (name: string, type: string) =>
      events.find((e) => e.name === name && e.event_type === type)?.c ?? 0;

    return {
      a: {
        views: pick("a", "page_view"),
        clicks: pick("a", "cta_click"),
        feedback: fb.filter((f) => f.name === "a").map((f) => f.text),
      },
      b: {
        views: pick("b", "page_view"),
        clicks: pick("b", "cta_click"),
        feedback: fb.filter((f) => f.name === "b").map((f) => f.text),
      },
      live: true,
    };
  } catch (error) {
    console.error("[DEMO] Falling back to frozen snapshot:", error);
    return {
      a: { views: 11, clicks: 4, feedback: [] },
      b: { views: 10, clicks: 2, feedback: [] },
      live: false,
    };
  }
}

const pct = (clicks: number, views: number) =>
  views === 0 ? "—" : `${((clicks / views) * 100).toFixed(1)}%`;

/** Every conclusion on this page carries its sample size. */
function SampleTag({ n }: { n: number }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
      n&nbsp;=&nbsp;{n}
      {n < 30 && (
        <span className="ml-2 text-amber-500/80">
          directional, not significant
        </span>
      )}
    </span>
  );
}

function VariantCard({
  label,
  kicker,
  headline,
  sub,
  counts,
  accent,
}: {
  label: string;
  kicker: string;
  headline: string;
  sub: string;
  counts: Counts;
  accent: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <span
          className="font-mono text-[11px] uppercase tracking-[0.2em]"
          style={{ color: accent }}
        >
          {label}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
          {kicker}
        </span>
      </div>

      <h3 className="mt-5 text-balance text-xl font-semibold leading-[1.15] tracking-tight text-neutral-50 sm:text-2xl">
        {headline}
      </h3>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-neutral-400">
        {sub}
      </p>

      <div className="mt-7 grid grid-cols-3 gap-4 border-t border-neutral-800 pt-6">
        <div>
          <div className="font-mono text-2xl tabular-nums text-neutral-50">
            {counts.views}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-widest text-neutral-500">
            Views
          </div>
        </div>
        <div>
          <div className="font-mono text-2xl tabular-nums text-neutral-50">
            {counts.clicks}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-widest text-neutral-500">
            CTA clicks
          </div>
        </div>
        <div>
          <div
            className="font-mono text-2xl tabular-nums"
            style={{ color: accent }}
          >
            {pct(counts.clicks, counts.views)}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-widest text-neutral-500">
            Click rate
          </div>
        </div>
      </div>

      <div className="mt-5">
        <SampleTag n={counts.views} />
      </div>
    </div>
  );
}

export default async function DemoPage() {
  const { a, b, live } = await loadResults();
  const totalViews = a.views + b.views;
  const allFeedback = [
    ...a.feedback.map((t) => ({ v: "A", t })),
    ...b.feedback.map((t) => ({ v: "B", t })),
  ];

  const A = DEMO_SNAPSHOT.variants.find((v) => v.name === "a");
  const B = DEMO_SNAPSHOT.variants.find((v) => v.name === "b");
  if (!A || !B) return null;

  const confusion: readonly string[] = DEMO_LEARNING.visitor_confusion ?? [];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-200">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <header className="border-b border-neutral-800 pb-12">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400">
              Recorded run
            </span>
            <span className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
              {live ? "Live from database" : "Frozen snapshot"}
            </span>
          </div>

          <h1 className="mt-8 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-neutral-50 sm:text-6xl">
            One product. Two positions.
            <br />
            <span className="text-neutral-500">The visitors decide.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-neutral-400">
            A complete LaunchLoop cycle run against{" "}
            <a
              href="https://github.com/hanamaraddi9620adi/swinglens"
              className="text-neutral-200 underline decoration-neutral-700 underline-offset-4 transition hover:decoration-neutral-400"
            >
              github.com/hanamaraddi9620adi/swinglens
            </a>
            . The analysis, both landing pages, and the rewrite below are exactly
            what the model produced, copied out of the database unedited.
          </p>
        </header>

        <section className="border-b border-neutral-800 py-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            01 — What it read from the code
          </h2>
          <p className="mt-6 max-w-3xl text-pretty text-lg leading-relaxed text-neutral-300">
            {DEMO_SNAPSHOT.analysis.summary}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {DEMO_SNAPSHOT.analysis.features
              .slice(0, 6)
              .map((f: string) => (
                <span
                  key={f}
                  className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 font-mono text-[11px] text-neutral-400"
                >
                  {f.split(":")[0]}
                </span>
              ))}
          </div>
        </section>

        <section className="border-b border-neutral-800 py-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              02 — Two positions, deployed live
            </h2>
            <SampleTag n={totalViews} />
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <VariantCard
              label="Variant A"
              kicker="Outcome / pain"
              headline={A.positioning.headline}
              sub={A.positioning.subheadline}
              counts={a}
              accent="#34d399"
            />
            <VariantCard
              label="Variant B"
              kicker="Capability / transformation"
              headline={B.positioning.headline}
              sub={B.positioning.subheadline}
              counts={b}
              accent="#818cf8"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/e/${DEMO_EXPERIMENT_ID}/a`}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900"
            >
              Open variant A →
            </Link>
            <Link
              href={`/e/${DEMO_EXPERIMENT_ID}/b`}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900"
            >
              Open variant B →
            </Link>
          </div>
        </section>

        <section className="border-b border-neutral-800 py-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              03 — What visitors misunderstood
            </h2>
            <SampleTag n={allFeedback.length} />
          </div>

          {allFeedback.length === 0 ? (
            <p className="mt-6 text-sm text-neutral-500">
              No written feedback in this snapshot.
            </p>
          ) : (
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {allFeedback.map(({ v, t }, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5"
                >
                  <span
                    className={`font-mono text-[11px] uppercase tracking-widest ${
                      v === "A" ? "text-emerald-400" : "text-indigo-400"
                    }`}
                  >
                    Variant {v}
                  </span>
                  <p className="mt-2 text-pretty text-sm leading-relaxed text-neutral-300">
                    &ldquo;{t}&rdquo;
                  </p>
                </li>
              ))}
            </ul>
          )}

          {confusion.length > 0 && (
            <div className="mt-8 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-6">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-500/90">
                Patterns the model found
              </h3>
              <ul className="mt-4 space-y-2">
                {confusion.map((c) => (
                  <li
                    key={c}
                    className="text-pretty text-sm leading-relaxed text-neutral-300"
                  >
                    <span className="mr-2 text-amber-500/60">—</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="py-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              04 — Proposed V3
            </h2>
            <span className="rounded-full border border-neutral-700 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-neutral-400">
              Awaiting approval — not deployed
            </span>
          </div>

          <div className="mt-8 rounded-xl border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
              Confidence
            </p>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-neutral-300">
              {DEMO_LEARNING.confidence}
            </p>

            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                  Strongest message
                </p>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-emerald-300/90">
                  {DEMO_LEARNING.strongest_message}
                </p>
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                  Weakest message
                </p>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-neutral-400">
                  {DEMO_LEARNING.weakest_message}
                </p>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-800 pt-6">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                Next hypothesis
              </p>
              <p className="mt-3 text-balance text-xl font-semibold leading-snug tracking-tight text-neutral-50">
                {DEMO_LEARNING.next_hypothesis}
              </p>
              <p className="mt-4 text-pretty text-sm leading-relaxed text-neutral-400">
                {DEMO_LEARNING.recommended_changes}
              </p>
            </div>
          </div>

          {/*
            The diff a founder actually approves. Shown here so the closing
            step of the loop is visible without running an experiment — it is
            the step that separates this from a page generator, and describing
            it in prose would have been the weaker choice.
          */}
          <div className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                What V3 changes — {DEMO_V3.changes.length} fields
              </p>
              <p className="font-mono text-[11px] text-neutral-600">
                from variant {DEMO_V3.basedOnVariant.toUpperCase()} · grounded in{" "}
                {DEMO_V3.sampleFeedbackCount} written responses
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {DEMO_V3.changes.map((c) => (
                <div
                  key={c.field}
                  className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
                >
                  <div className="border-b border-neutral-800 bg-neutral-900/50 px-4 py-2">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">
                      {c.label}
                    </span>
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="text-pretty text-sm leading-relaxed text-neutral-500 line-through decoration-red-500/40">
                      {c.before}
                    </p>
                    <p className="text-pretty text-sm leading-relaxed text-neutral-100">
                      {c.after}
                    </p>
                    <p className="border-t border-neutral-800/80 pt-2 text-pretty text-xs leading-relaxed text-neutral-500">
                      <span className="text-neutral-400">Why: </span>
                      {c.reason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-6 max-w-2xl text-pretty text-sm leading-relaxed text-neutral-500">
            LaunchLoop never redeploys on its own. V3 stays a proposal until a
            human approves it — and approving it ships V3 against the version
            it beat, so the comparison continues instead of ending on a guess.
          </p>
        </section>

        <footer className="border-t border-neutral-800 pt-8">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500 transition hover:text-neutral-300"
          >
            ← Run this on your own repo
          </Link>
        </footer>
      </div>
    </main>
  );
}
