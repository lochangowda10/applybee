/**
 * End-to-end task-success harness.
 *
 * Runs the declared job — take an input, analyze it, generate two positions,
 * deploy both to live URLs, record a visitor, collect feedback, and produce a
 * V3 proposal — against several different inputs, and reports how many cases
 * completed without intervention.
 *
 * Usage: node scripts/e2e.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3009";

// Load .env.local when running against a local server.
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* running against a deployed URL; no local env needed */
}

// All three declared input types, since the pipeline must be identical
// regardless of which one a founder uses.
const CASES = [
  { name: "repo: swinglens", body: { input: "https://github.com/hanamaraddi9620adi/swinglens" } },
  { name: "repo: sindresorhus/got", body: { input: "https://github.com/sindresorhus/got" } },
  { name: "repo: expressjs/express", body: { input: "https://github.com/expressjs/express" } },
  { name: "product url: vercel", body: { input: "https://vercel.com" } },
  { name: "product url: bare domain", body: { input: "linear.app" } },
  {
    name: "plain description",
    body: {
      input:
        "A tool that watches your CI pipeline and tells you which flaky test is costing your team the most engineering hours each week.",
    },
  },
];

const ms = (t) => `${((Date.now() - t) / 1000).toFixed(1)}s`;

/**
 * Every request is bounded. Without this a wedged server hangs the harness
 * indefinitely instead of reporting a failure, which is the one thing a
 * task-success harness must never do.
 */
const STEP_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS) || 120_000;

async function req(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`timed out after ${STEP_TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON ${res.status}: ${text.slice(0, 100)}`);
  }
}

async function runCase(c) {
  const started = Date.now();
  const steps = {};
  try {
    // 1. Analyze
    let t = Date.now();
    let res = await req(`${BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c.body),
    });
    let d = await json(res);
    if (!res.ok || !d.projectId) throw new Error(`analyze: ${d.error || res.status}`);
    steps.analyze = ms(t);
    const projectId = d.projectId;
    const productName = d.analysis?.product_name ?? "(none)";

    // 2. Positioning + deploy both variants
    t = Date.now();
    res = await req(`${BASE}/api/positioning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    d = await json(res);
    if (!res.ok || !d.experimentId) throw new Error(`positioning: ${d.error || res.status}`);
    if (!Array.isArray(d.variants) || d.variants.length !== 2) {
      throw new Error(`positioning: expected 2 variants, got ${d.variants?.length}`);
    }
    steps.positioning = ms(t);
    const experimentId = d.experimentId;
    const variantId = d.variants[0].id;

    // 3. Both variant pages must actually serve
    t = Date.now();
    for (const v of ["a", "b"]) {
      const r = await req(`${BASE}/e/${experimentId}/${v}`);
      if (!r.ok) throw new Error(`variant ${v} page: HTTP ${r.status}`);
    }
    steps.pages = ms(t);

    // 4. Record a visitor and a comment
    t = Date.now();
    res = await req(`${BASE}/api/experiments/${experimentId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId, eventType: "page_view", sessionId: "e2e" }),
    });
    if (!res.ok) throw new Error(`events: HTTP ${res.status}`);
    res = await req(`${BASE}/api/experiments/${experimentId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId, text: "Not sure who this is for." }),
    });
    if (!res.ok) throw new Error(`feedback: HTTP ${res.status}`);
    steps.visitor = ms(t);

    // 5. V3 proposal
    t = Date.now();
    res = await req(`${BASE}/api/experiments/${experimentId}/learning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    d = await json(res);
    if (!res.ok || !d.analysis?.next_hypothesis) {
      throw new Error(`learning: ${d.error || res.status}`);
    }
    steps.learning = ms(t);

    // 6. Resume from a cold start (Memory)
    t = Date.now();
    res = await req(`${BASE}/api/projects/${projectId}`);
    d = await json(res);
    if (!res.ok || d.variants?.length !== 2) throw new Error(`resume: ${d.error || res.status}`);
    steps.resume = ms(t);

    return { ok: true, name: c.name, productName, total: ms(started), steps };
  } catch (err) {
    return { ok: false, name: c.name, total: ms(started), error: err.message, steps };
  }
}

const results = [];
for (const c of CASES) {
  process.stdout.write(`running ${c.name} … `);
  const r = await runCase(c);
  results.push(r);
  console.log(r.ok ? `PASS (${r.total})` : `FAIL (${r.total}) — ${r.error}`);
}

const passed = results.filter((r) => r.ok).length;
console.log("\n──────── task success ────────");
for (const r of results) {
  const detail = r.ok
    ? `${r.productName} | ${Object.entries(r.steps).map(([k, v]) => `${k} ${v}`).join(", ")}`
    : r.error;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(24)} ${detail}`);
}
console.log(
  `\n${passed}/${results.length} cases completed end-to-end ` +
    `(${((passed / results.length) * 100).toFixed(0)}%)`
);
process.exit(passed === results.length ? 0 : 1);
