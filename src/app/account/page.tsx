import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { initDB } from "@/lib/init";
import { getSessionUserFromCookies, maskEmail } from "@/lib/auth";
import { CopyButton } from "@/components/copy-button";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "LaunchLoop AI — Account",
  description: "Your referral code and the founders you've credited.",
};

type Claim = { email: string; claimed_at: string };
type Project = { name: string; created_at: string };

export default async function AccountPage() {
  await initDB();
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login?next=/account");

  const [receivedRows, madeRows, projectRows] = await Promise.all([
    db<Claim>`
      SELECT u.email, c.claimed_at
      FROM referral_claims c
      JOIN users u ON u.id = c.claimer_user_id
      WHERE c.referrer_user_id = ${user.id}
      ORDER BY c.claimed_at DESC
      LIMIT 50
    `,
    db<Claim>`
      SELECT u.email, c.claimed_at
      FROM referral_claims c
      JOIN users u ON u.id = c.referrer_user_id
      WHERE c.claimer_user_id = ${user.id}
      ORDER BY c.claimed_at DESC
      LIMIT 50
    `,
    db<Project>`
      SELECT name, created_at FROM projects
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 50
    `,
  ]);

  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  const shareUrl = `${base}/?code=${user.referral_code}`;

  return (
    <main className="min-h-screen bg-background">
      <nav className="fixed top-0 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl z-50">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight transition-opacity hover:opacity-80"
          >
            LaunchLoop
          </Link>
          <div className="flex items-center gap-5">
            <Link
              href="/referrals"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Referral chain
            </Link>
            <SignOutButton />
          </div>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-4xl px-5 pb-24 pt-24 sm:px-8">
        <header className="border-b border-border/50 pb-10">
          <span className="label text-muted-foreground">Account</span>
          <h1 className="display mt-6 text-balance text-3xl text-foreground sm:text-4xl">
            Your referrals, in one place.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every generated page and shared link can carry your code. When
            someone claims it, they credit you — and the chain is visible to
            everyone on the public referral page.
          </p>
        </header>

        <section className="mt-10 rounded-xl border border-border/60 bg-card p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <span className="label text-muted-foreground">
                Your referral code
              </span>
              <div className="mt-3 flex items-center gap-3">
                <span className="font-mono text-2xl tracking-[0.25em] text-foreground">
                  {user.referral_code}
                </span>
                <CopyButton value={user.referral_code} />
              </div>
            </div>
            <div className="text-right">
              <span className="label text-muted-foreground">Share link</span>
              <div className="mt-3 flex items-center justify-end gap-3">
                <span className="max-w-64 truncate font-mono text-[11px] text-muted-foreground">
                  {shareUrl}
                </span>
                <CopyButton value={shareUrl} />
              </div>
            </div>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            Signed in as{" "}
            <span className="text-foreground">{user.email}</span>. Anyone who
            arrives through your link and claims it shows up below.
          </p>
        </section>

        <section className="mt-12 grid gap-5 sm:grid-cols-3">
          {[
            { label: "Founders you credited", value: madeRows.length },
            { label: "Founders who claimed you", value: receivedRows.length },
            { label: "Projects on this account", value: projectRows.length },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border/60 bg-card p-5"
            >
              <div className="font-mono text-3xl tabular-nums text-foreground">
                {stat.value}
              </div>
              <p className="label mt-2 text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="label text-muted-foreground">You claimed</h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              n&nbsp;=&nbsp;{madeRows.length}
            </span>
          </div>
          {madeRows.length === 0 ? (
            <div className="mt-4 rounded-xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
              You haven&rsquo;t claimed any referrals yet.{" "}
              <Link
                href="/referrals/claim"
                className="text-accent underline underline-offset-4"
              >
                Enter a code →
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {madeRows.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 px-5 py-3 text-sm"
                >
                  <span className="text-muted-foreground">
                    Credited{" "}
                    <span className="text-foreground">{maskEmail(r.email)}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {new Date(r.claimed_at).toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="label text-muted-foreground">Claimed your code</h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              n&nbsp;=&nbsp;{receivedRows.length}
            </span>
          </div>
          {receivedRows.length === 0 ? (
            <div className="mt-4 rounded-xl border border-border/60 bg-card p-6 text-sm leading-relaxed text-muted-foreground">
              Nobody has claimed your code yet. Put it in your next experiment:
              every generated page footer now carries it, or share your link
              directly.
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {receivedRows.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 px-5 py-3 text-sm"
                >
                  <span className="text-muted-foreground">
                    <span className="text-foreground">{maskEmail(r.email)}</span>{" "}
                    claimed your code
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {new Date(r.claimed_at).toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="label text-muted-foreground">Your projects</h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              n&nbsp;=&nbsp;{projectRows.length}
            </span>
          </div>
          {projectRows.length === 0 ? (
            <div className="mt-4 rounded-xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
              Projects you start while signed in appear here.{" "}
              <Link
                href="/"
                className="text-accent underline underline-offset-4"
              >
                Start one →
              </Link>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {projectRows.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 px-5 py-3 text-sm"
                >
                  <span className="text-foreground">{p.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {new Date(p.created_at).toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
