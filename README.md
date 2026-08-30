# LaunchLoop AI

**Founders don't fail because the code is bad. They fail because nobody understands what it's for.**

Give LaunchLoop a repo, a live product URL, or one sentence about what you built. It writes two opposing positions, deploys both as real landing pages, and lets actual visitors tell you which one lands — and what they misread.

**Live:** [applybee.vercel.app](https://applybee.vercel.app) · **See a completed run:** [applybee.vercel.app/demo](https://applybee.vercel.app/demo)

Built for THE HIVE / ApplyBee AI Hackathon 2026.

---

## The loop

Positioning is normally a guess a founder makes once, alone, and never tests. LaunchLoop closes that loop end to end:

```
 Repo · product URL · plain description
              ↓
     Read what the product does          ← repo: code, README, deps, routes
                                         ← URL:  the page's own copy, fetched
                                         ← text: the founder's own words
              ↓
  Two OPPOSING positioning hypotheses    ← outcome/pain  vs  capability/transformation
              ↓
   Two landing pages, deployed live      ← real URLs, QR codes, 50/50 split
              ↓
    Real visitors view and answer        ← page views, CTA clicks, one written question
              ↓
   What visitors MISUNDERSTOOD           ← qualitative, not just conversion %
              ↓
       A proposed V3 rewrite             ← never auto-deployed; a human approves
              ↓
            repeat ↺
```

The V3 step is what makes this a loop rather than a generator. Most AI page tools stop at "here is a landing page." LaunchLoop's output is a *finding*: which framing worked, which confused people, and what to say instead.

### Three ways in

The pipeline is identical whichever you use — same analysis shape, same two
hypotheses, same deployed pages, same rewrite.

| Input | What it reads | Example |
|---|---|---|
| **Public repo** | README, file tree, key file contents, dependencies | `github.com/you/project` |
| **Live product URL** | The page's own title, meta and body copy, fetched and stripped | `linear.app` |
| **Plain description** | One sentence in the founder's own words | *"A tool that finds which flaky test costs you the most hours."* |

The last two matter most in practice: at a live event, few people will hand a
stranger their private repo. Confidence is reported honestly per input — a
sentence is less evidence than a codebase, and the analysis says so.

---

## It actually works — measured, not claimed

Four different inputs, run end to end with no human intervention. Reproduce with `node scripts/e2e.mjs`; raw output in [`scripts/e2e-results.txt`](scripts/e2e-results.txt).

| Input | Analyze | Positioning + deploy | V3 proposal | Total |
|---|---|---|---|---|
| `hanamaraddi9620adi/swinglens` | 11.1s | 34.7s | 17.2s | 66s |
| `sindresorhus/got` | 9.9s | 25.1s | 10.5s | 49s |
| `expressjs/express` | 7.4s | 23.1s | 11.3s | 44s |
| `vercel.com` (product URL) | 0.5s | 29.9s | 7.8s | 42s |

**4/4 complete (100%)**, each producing two live variant pages, recorded visitor events, and a V3 proposal.

The first run of this harness scored 3/4 and caught two real bugs — a response envelope that collapsed two hypotheses into one, and an unwrap that could silently return a hypothesis's `benefits` list *as* the hypotheses. Both are fixed; the harness is why they were found.

### A real recorded run

`/demo` replays an actual experiment against `swinglens`, copied from the database unedited:

| Variant | Framing | Views | CTA clicks | Click rate |
|---|---|---|---|---|
| **A** | Outcome / pain | 11 | 4 | **36.4%** |
| **B** | Capability / transformation | 10 | 2 | **20.0%** |

Sample size is on every claim, and below n=30 it is labelled *directional, not significant*. The model's own verdict was *"early directional signal in favour of Variant A, but based on very small samples."* A tool that overstated this would be worse than useless.

---

## Pricing

Per-experiment credits — you pay when you learn something, not for an idle seat.

| | Price | |
|---|---|---|
| **First one free** | $0 | 1 experiment, nothing withheld |
| **Starter** | $19 | 10 experiments · $1.90 each |
| **Growth** | $79 | 50 experiments · $1.58 each |

**Unit economics, measured:** one complete experiment is **10,467 tokens across 5 model calls**. At nano-tier rates that is a fraction of a cent against a $1.58–$1.90 price — gross margin above 99%. Acquisition is structural rather than paid: every generated page footer links back with referral attribution, so a shared experiment is a distribution surface.

The alternative isn't another AI tool. It's a positioning consultant at four figures, or a copywriter per page — neither of whom tells you what visitors actually misunderstood.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # .env.local — it is gitignored; .env.example is not
npm run dev
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | Neon Postgres connection string, ending `?sslmode=require` |
| `OPENAI_API_KEY` | **Yes** | OpenAI or any OpenAI-compatible key |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Base for QR codes and share links |
| `OPENAI_BASE_URL` | No | API **root**, e.g. `https://api.openai.com/v1` — not a full endpoint |
| `AI_MODEL` | No | Default `gpt-5-nano` |
| `AI_TIMEOUT_MS` | No | Per-call ceiling, default `20000` |
| `GITHUB_TOKEN` | No | Raises GitHub's limit from 60/hr to 5,000/hr |

Without `OPENAI_API_KEY` the app runs on deterministic generated content rather than failing.

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/                  # repo / product-URL / description → product analysis
│   │   ├── context/                  # founder's own answers
│   │   ├── positioning/              # two hypotheses + two landing pages
│   │   ├── projects/[projectId]/     # rehydrate a run from the database
│   │   └── experiments/[experimentId]/
│   │       ├── events/               # page views, CTA clicks
│   │       ├── feedback/             # the one question visitors answer
│   │       ├── learning/             # V3 proposal
│   │       └── variant/              # variant content
│   ├── e/[experimentId]/[variant]/   # the live landing pages visitors see
│   ├── x/[experimentId]/             # 50/50 assignment, sticky per visitor
│   ├── project/[projectId]/          # founder's dashboard
│   ├── demo/                         # recorded run, no live AI call needed
│   ├── referrals/                    # who found us through whose page
│   └── page.tsx
├── lib/
│   ├── ai/
│   │   ├── provider.ts               # timeout, parameter repair, JSON recovery
│   │   └── analysis.ts               # the four AI steps, each with a fallback
│   ├── input/sources.ts              # product-URL fetching, description analysis
│   ├── github/service.ts             # repo intelligence, rate-limit handling
│   ├── demo/                         # frozen snapshot + idempotent seeder
│   ├── api.ts                        # body parsing, validation, safe errors
│   ├── errors.ts                     # raw failures → human sentences
│   ├── db.ts                         # Neon Postgres over HTTP
│   └── db-schema.ts                  # schema init, one transaction
├── components/
│   ├── progress-status.tsx           # honest progress + error presentation
│   └── ui/                           # shadcn/ui
└── scripts/e2e.mjs                   # the harness behind the table above
```

---

## Engineering decisions that mattered

**Neon Postgres over HTTP, not SQLite.** Vercel's filesystem is read-only and ephemeral — a local database file loses every write between invocations. Since the entire product is *persisting what visitors did*, that would have been fatal. Schema init ships as a single transaction, so a cold start costs one round trip rather than nine.

**Every AI call has a 20s ceiling and a fallback.** Untimed calls were measured hanging for 180 seconds, which on stage is indistinguishable from a crash. The budget is shared across retries so a bad provider can't multiply the wait, and each of the four AI steps degrades to deterministic content instead of throwing. A model failure costs quality, never a blank screen.

**The provider repairs itself.** Models disagree about `temperature`, `max_tokens` vs `max_completion_tokens`, and `response_format`. Rejections are dispatched on the structured `error.param` field rather than substring-matching the prose — OpenAI phrases the same rejection three different ways, and matching one silently fails for the others.

**Reasoning tokens come out of the output budget.** `gpt-5-nano` was measured burning ~1,100 reasoning tokens on a 51-token prompt, so a 2,000-token budget produced empty completions. The caller's `maxTokens` is now a *content* budget with reasoning headroom added on top.

**State lives in Postgres, not sessionStorage.** A refresh used to strand the user on a progress animation that never finished. Any run can now be resumed from its URL, questionnaire answers included.

**Errors are translated before they're shown.** Provider strings like `AI API error (400): {"error":...}` never reach a user; they map to a plain sentence, a next action, and whether retrying will help. At the API layer the same rule holds: a caller's mistake returns its own message, anything internal is logged in full and answered generically, so a failure can't leak configuration detail into a browser.

**Input is classified server-side, not guessed by the client.** The page sends what was typed; the server decides whether it is a repo, a URL, or prose. Guessing in the browser is what previously routed a typed paragraph into the URL field, where it reached `new URL()` and threw a 500.

---

## Honest limitations

- Sample sizes in a hackathon setting are small. The product says so on every screen rather than implying significance it hasn't earned.
- There is no authentication. Anyone holding a project URL can view its dashboard, and the ids are unguessable UUIDs rather than a real access control. This is the largest known gap.
- Visitor events are validated but not rate limited, so the counts assume good faith. Fine for a demo; not for production.
- V3 is proposed, never auto-deployed — deliberate, but it does mean the loop needs one human step to close.

---

## Tech stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · shadcn/ui · Neon Postgres (`@neondatabase/serverless`) · OpenAI-compatible API · GitHub REST API v3 · deployed on Vercel.

## License

MIT
