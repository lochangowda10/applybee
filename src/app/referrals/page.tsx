import Link from "next/link";
import { db } from "@/lib/db";
import { initDB } from "@/lib/init";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "LaunchLoop — Referral chain",
  description: "Who found LaunchLoop through whose page.",
};

type Row = {
  referred_project: string;
  referred_project_id: string;
  referrer_project: string | null;
  referrer_variant: string | null;
  referrer_experiment_id: string | null;
  created_at: string;
};

/**
 * Every generated landing page footers back to LaunchLoop with the variant's
 * id attached, so when a visitor to someone else's experiment starts their own
 * project we can say which page sent them. This reads that chain back out.
 */
async function loadChain(): Promise<{ rows: Row[]; live: boolean }> {
  try {
    await initDB();
    const rows = await db<Row>`
      SELECT
        rp.name        AS referred_project,
        rp.id          AS referred_project_id,
        srcp.name      AS referrer_project,
        v.name         AS referrer_variant,
        r.referrer_experiment_id,
        r.created_at
      FROM referrals r
      JOIN projects rp   ON rp.id = r.referred_project_id
      LEFT JOIN variants v    ON v.id = r.referrer_variant_id
      LEFT JOIN experiments e ON e.id = r.referrer_experiment_id
      LEFT JOIN projects srcp ON srcp.id = e.project_id
      ORDER BY r.created_at DESC
      LIMIT 100
    `;
    return { rows, live: true };
  } catch (error) {
    console.error("[REFERRALS] Failed to load chain:", error);
    return { rows: [], live: false };
  }
}

export default async function ReferralsPage() {
  const { rows, live } = await loadChain();

  // How many new projects each referring page has produced.
  const bySource = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.referrer_project ?? "Unknown"} · variant ${
      r.referrer_variant?.toUpperCase() ?? "?"
    }`;
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }
  const ranked = [...bySource.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-200">
      <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
        <header className="border-b border-neutral-800 pb-10">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Referral chain
          </span>
          <h1 className="mt-6 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-neutral-50 sm:text-4xl">
            Who found us through whose page.
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-sm leading-relaxed text-neutral-400">
            Every landing page LaunchLoop deploys credits itself in the footer.
            When a visitor to one founder&rsquo;s experiment comes back and runs
            their own, that hop is recorded here — so distribution is something
            the product can show, not something it claims.
          </p>
        </header>

        <section className="py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              Hops recorded
            </h2>
            <span className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
              n&nbsp;=&nbsp;{rows.length}
              {rows.length > 0 && rows.length < 30 && (
                <span className="ml-2 text-amber-500/80">
                  directional, not significant
                </span>
              )}
            </span>
          </div>

          {!live ? (
            <p className="mt-8 text-sm text-neutral-500">
              The referral chain is temporarily unavailable.
            </p>
          ) : rows.length === 0 ? (
            <div className="mt-8 rounded-xl border border-neutral-800 bg-neutral-950 p-8">
              <p className="text-sm leading-relaxed text-neutral-400">
                No referrals recorded yet. Every deployed variant page links back
                with its own id, so the first visitor who arrives through one and
                starts their own project will appear here.
              </p>
              <Link
                href="/demo"
                className="mt-5 inline-block font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-400 transition hover:text-neutral-200"
              >
                See a deployed page →
              </Link>
            </div>
          ) : (
            <>
              {ranked.length > 0 && (
                <div className="mt-8 rounded-xl border border-neutral-800 bg-neutral-950 p-6">
                  <h3 className="font-mono text-[11px] uppercase tracking-widest text-neutral-500">
                    Top referring pages
                  </h3>
                  <ul className="mt-4 space-y-2">
                    {ranked.map(([source, count]) => (
                      <li
                        key={source}
                        className="flex items-baseline justify-between gap-4 text-sm"
                      >
                        <span className="text-neutral-300">{source}</span>
                        <span className="font-mono tabular-nums text-neutral-50">
                          {count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <ul className="mt-5 space-y-3">
                {rows.map((r, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-neutral-300">
                        {r.referrer_project ?? "Unknown page"}
                      </span>
                      {r.referrer_variant && (
                        <span className="rounded border border-neutral-700 px-1.5 py-0.5 font-mono text-[10px] uppercase text-neutral-400">
                          variant {r.referrer_variant}
                        </span>
                      )}
                      <span className="text-neutral-600">→</span>
                      <span className="font-medium text-neutral-50">
                        {r.referred_project}
                      </span>
                    </div>
                    <div className="mt-2 font-mono text-[11px] text-neutral-500">
                      {new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <footer className="border-t border-neutral-800 pt-8">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500 transition hover:text-neutral-300"
          >
            ← Back
          </Link>
        </footer>
      </div>
    </main>
  );
}
