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
       A proposed V3 rewrite             ← a reviewable diff, field by field
              ↓
        A human approves it               ← nothing deploys on its own
              ↓
   V3 ships as variant A of the next      ← the version it beat becomes B,
   experiment, against the old winner        so the comparison never stops
              ↓
            repeat ↺
```

The V3 step is what makes this a loop rather than a generator. Most AI page tools stop at "here is a landing page." LaunchLoop's output is a *finding*: which framing worked, which confused people, and what to say instead.

And V3 is presented as a **diff, not a redraft** — every changed line shown
beside the line it replaces, with the visitor evidence that justifies it. The
diff is computed by comparing the stored strings rather than asking the model
to describe its own edits, because a model can be wrong in the one direction
that matters here: claiming a line is unchanged when it is not. A human is
approving a deployment on the strength of that list.

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

Six inputs across all three types, run end to end with no human intervention,
against a production build. Every case runs the **entire loop**: analyze,
generate two positions, deploy both, record a visitor and a written response,
read the results, propose V3 as a diff, approve it, and deploy the next
experiment. Reproduce with `QUOTA_DISABLED=1 npm start` and then `node scripts/e2e.mjs
http://localhost:3000`; raw output in
[`scripts/e2e-results.txt`](scripts/e2e-results.txt). The tier has to be
lifted for this: six runs from one address is exactly what the free tier is
built to refuse, so the harness would otherwise block itself after the first
case. The tier has its own test, `node scripts/quota-check.mjs`, which asserts
the refusal instead of avoiding it.

| Input | Type | Analyze | Position + deploy | Results | V3 diff | Approve + ship | Total |
|---|---|---|---|---|---|---|---|
| `hanamaraddi9620adi/swinglens` | repo | 9.1s | 22.1s | 9.9s | 6.2s · 5 changes | 16.4s | 69s |
| `sindresorhus/got` | repo | 7.8s | 23.0s | 8.6s | 7.1s · 4 changes | 15.8s | 67s |
| `expressjs/express` | repo | 7.1s | 20.3s | 8.1s | 7.2s · 5 changes | 15.7s | 63s |
| `https://vercel.com` | product URL | 5.9s | 22.1s | 9.9s | 7.0s · 5 changes | 19.7s | 69s |
| `linear.app` | bare domain | 6.4s | 20.8s | 6.3s | 7.1s · 4 changes | 14.3s | 60s |
| *"a tool that finds which flaky test costs the most hours"* | description | 3.9s | 16.5s | 6.3s | 4.9s · 4 changes | 12.8s | 49s |

**6/6 complete (100%)**, each producing two live variant pages, recorded
visitor events, a reviewable V3 diff, a second deployed experiment, and a
successful cold-start resume.

The change counts differ per case because the diff is computed, not scripted —
`got` and Linear produced four changed fields in this run, SwingLens five. An
earlier run had Express change a single field and `got` change six; the number
moves with what visitors actually said, which is the point. Each case
also asserts the things that could silently rot: that proposing never returns
as approved, that no listed change has `before === after`, that approval
creates a *different* experiment, and that a second browser attempting to
deploy someone else's pages is refused with a 403.

Earlier runs of this harness are why several bugs exist as fixes rather than as
live failures: it scored 3/4 the first time and caught a response envelope that
collapsed two hypotheses into one, plus an unwrap that could silently return a
hypothesis's `benefits` list *as* the hypotheses. A later run exposed that the
product-URL and plain-description inputs were not really implemented at all.

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
| **Free** | $0 | 1 experiment a week, up to 4 a month |
| **Free, on the waitlist** | $0 | 8 a month, no weekly gate |
| **Starter** | $5 · ₹440 | 10 experiments · $0.50 each |
| **Growth** | $20 · ₹1,760 | 50 experiments · $0.40 each |

The free tier is **enforced, not advertised**: `/api/analyze` refuses a
second project in the same week the same way it refuses a bad repo URL. The allowance is
counted per caller against an HMAC of their address — the address itself is
never stored — and a blocked caller gets a 429 that names the limit, says
when it resets, and offers the waitlist when joining would actually lift it.
See `src/lib/quota.ts`; it is a different mechanism from the abuse limiter in
`src/lib/rate-limit.ts`, and unlike that one it fails closed.

**Unit economics, measured:** one complete experiment is **10,467 tokens across 5 model calls**. At nano-tier rates that is about a sixth of a cent against a $0.40–$0.50 price — gross margin above 99%. Rupee prices are set rather than converted live, at ₹88 to the dollar; every figure comes from `src/lib/pricing.ts`, which the pricing table, the plan picker and the committed-value total all read, so no two of them can quote different numbers. Acquisition is structural rather than paid: every generated page footer links back with referral attribution, so a shared experiment is a distribution surface.

**Willingness to pay is recorded, not asserted.** The pricing section captures
real addresses against a chosen plan and publishes the running count. It is
labelled as intent rather than revenue everywhere it appears, because nobody
has been charged — a surface that blurred the two would be doing exactly what
this product criticises other tools for. Submissions deduplicate by address,
so the number cannot be inflated by submitting twice.

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
| `OWNER_SECRET` | No | Signs the project-ownership and waitlist cookies. Unset = every project stays unclaimed and nobody can be signed up |
| `QUOTA_FREE_WEEK` | No | Free experiments per week for an anonymous caller, default `1` |
| `QUOTA_FREE_MONTH` | No | Monthly ceiling for an anonymous caller, default `4` |
| `QUOTA_SIGNED_MONTH` | No | Monthly allowance once someone joins the waitlist, default `8` |
| `QUOTA_DISABLED` | No | Set to `1` to lift the free tier entirely. Exists because a venue puts a whole room behind one address |

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
│   │   ├── interest/                 # waitlist signup + recorded willingness to pay
│   │   ├── quota/                    # what this visitor has left on the free tier
│   │   ├── projects/[projectId]/     # rehydrate a run from the database
│   │   └── experiments/[experimentId]/
│   │       ├── events/               # page views, CTA clicks
│   │       ├── feedback/             # the one question visitors answer
│   │       ├── learning/             # what the results mean
│   │       ├── v3/                   # propose a diff; approve to deploy
│   │       └── variant/              # variant content
│   ├── e/[experimentId]/[variant]/   # the live landing pages visitors see
│   ├── error.tsx, global-error.tsx   # boundaries: a crash keeps the frame
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
│   ├── pricing.ts                    # every price, in one place, both currencies
│   ├── quota.ts                      # the free tier — fail-closed, unlike the limiter
│   ├── rate-limit.ts                 # fixed-window limiter, fail-open by design
│   └── db-schema.ts                  # schema init, one transaction
├── components/
│   ├── progress-status.tsx           # honest progress + error presentation
│   ├── purchase-intent.tsx           # pricing capture + live count
│   └── ui/                           # shadcn/ui
└── scripts/
    ├── e2e.mjs                       # the harness behind the table above
    ├── quota-check.mjs               # asserts the free tier actually refuses
    └── clean-test-intents.mjs        # clears synthetic signups from the counter
```

---

## Engineering decisions that mattered

**Neon Postgres over HTTP, not SQLite.** Vercel's filesystem is read-only and ephemeral — a local database file loses every write between invocations. Since the entire product is *persisting what visitors did*, that would have been fatal. Schema init ships as a single transaction, so a cold start costs one round trip rather than nine.

**Every AI call has a 20s ceiling and a fallback.** Untimed calls were measured hanging for 180 seconds, which on stage is indistinguishable from a crash. The budget is shared across retries so a bad provider can't multiply the wait, and each of the four AI steps degrades to deterministic content instead of throwing. A model failure costs quality, never a blank screen.

**The provider repairs itself.** Models disagree about `temperature`, `max_tokens` vs `max_completion_tokens`, and `response_format`. Rejections are dispatched on the structured `error.param` field rather than substring-matching the prose — OpenAI phrases the same rejection three different ways, and matching one silently fails for the others.

**Reasoning tokens come out of the output budget.** `gpt-5-nano` was measured burning ~1,100 reasoning tokens on a 51-token prompt, so a 2,000-token budget produced empty completions. The caller's `maxTokens` is now a *content* budget with reasoning headroom added on top.

**State lives in Postgres, not sessionStorage.** A refresh used to strand the user on a progress animation that never finished. Any run can now be resumed from its URL, questionnaire answers included.

**Errors are translated before they're shown.** Provider strings like `AI API error (400): {"error":...}` never reach a user; they map to a plain sentence, a next action, and whether retrying will help. At the API layer the same rule holds: a caller's mistake returns its own message, anything internal is logged in full and answered generically, so a failure can't leak configuration detail into a browser.

**The V3 diff is computed, not narrated.** The model returns a revised
positioning and its reasons; the change list is produced by comparing the old
and new strings field by field. Asking a model to report what it changed
invites the one error that breaks the feature — a line reported as untouched
that is not — and this list is what a founder approves a deployment on.

**Approval is a separate request, not a checkbox.** Proposing V3 and deploying
it are two different calls, and the deploying one is the only path that puts a
page in front of a visitor. A tool that read visitor responses and quietly
rewrote the live page would be the version of this product nobody should trust.

**Boundaries assume the thing that failed is the thing you'd rely on.** The
root boundary ships its own markup and inline styles, since a root-layout
failure may mean the stylesheet never loaded. The landing-page boundary
deliberately records no event: a page that failed to render was not a page
view, and inflating the count with crashes would corrupt the exact number a
founder is about to draw a conclusion from.

**Ownership without a sign-up form.** Asking a founder to create an account
before they have seen the product costs more users than it protects, so a
project is claimed by an anonymous id in a signed httpOnly cookie. It is a
real authorization boundary for writes — the id is HMAC-signed, so nobody can
mint one for someone else's project — while reads stay open, because a
dashboard only its author can open is a worse product. The whole mechanism is
inert unless `OWNER_SECRET` is set, so a deployment that has not opted in
behaves exactly as it did before rather than locking people out of their own
work over a missing variable.

**Input is classified server-side, not guessed by the client.** The page sends what was typed; the server decides whether it is a repo, a URL, or prose. Guessing in the browser is what previously routed a typed paragraph into the URL field, where it reached `new URL()` and threw a 500.

**The two variants differ in structure, not just wording.** A page's section order is derived from which hypothesis it argues: an outcome-pain variant opens on the problem and reaches the machinery last, a capability-transformation variant opens on what the product does and lands on the pain once the reader knows what is on offer. The hero follows the same split — centred for one, left-aligned for the other. Two variants that differ only in copy are not really two variants: the visitor meets the same page twice in different paint, and the experiment can only ever measure sentences. Deriving layout from the hypothesis costs no extra model call and makes the comparison a test of positioning rather than of phrasing.

**The call to action goes somewhere.** It was a button that recorded a click and said "Thanks!" — a dead end for anyone who believed the page. It now links to the deployed product, falling back to the repository, opening in a new tab so the visitor does not lose the question further down. When the founder only described their product there is genuinely nowhere to send anyone, so it stays a button rather than inventing a destination. The click is recorded on both paths, so the metric means the same thing either way.

**Rate limiting runs on the database the product already has.** In-memory counters limit nothing on serverless — each instance gets its own — and a second store (Redis) is one more service to provision and trust. The limiter is a fixed-window upsert in Neon: one statement per check, keyed per endpoint and per IP or session, with ceilings set far above human speed so a room of judges on one venue NAT never trips them. It fails open on purpose: rate limiting is a cost control, not an authorization boundary, and a cost control must never be the reason the product is down. The event endpoint carries two buckets rather than one, because its natural key — the visitor's session id — arrives from the client: a limiter keyed only on attacker-controlled input bounds nothing, so a per-IP ceiling sits behind the per-session one.

---

## Honest limitations

- Sample sizes in a hackathon setting are small. The product says so on every screen rather than implying significance it hasn't earned.
- Ownership is anonymous and browser-scoped, not account authentication. A project is claimed by whoever created it via a signed httpOnly cookie, and founder-side writes — saving answers, deploying pages, approving V3 — are refused to anyone else. But it is one browser, not an account: clear the cookie and you lose the claim, and there is no way to sign in from a second device. Reading stays deliberately open, since these links are meant to be shared.
- Rate limiting is per IP, and per IP is not per person. It stops the realistic abuse — one script in a loop farming AI calls or inflating a count — and it does not stop a distributed one rotating addresses. There is no CAPTCHA on the signup or feedback forms yet, so the willingness-to-pay number is protected by a rate limit and a uniqueness constraint, not by proof of a human. Both are the next thing to add, in that order.
- The free tier counts per address, and an address is not a person. Everyone behind one office or venue router shares a single allowance, which is generous toward abuse and harsh toward a crowded room; `QUOTA_DISABLED` and the three `QUOTA_*` limits exist so the numbers can be moved without a code change. Accounts would fix this properly, and are the same missing piece as the ownership limitation above.
- V3 is proposed, never auto-deployed — deliberate, but it does mean the loop needs one human step to close.
- Recorded willingness to pay is intent, not revenue. Nobody has been charged and there is no checkout; the count says so wherever it appears.

---

## Tech stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · shadcn/ui · Neon Postgres (`@neondatabase/serverless`) · OpenAI-compatible API · GitHub REST API v3 · deployed on Vercel.

## License

MIT
