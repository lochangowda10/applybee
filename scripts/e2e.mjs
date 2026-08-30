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

/**
 * A cookie jar per case, because a browser is the client this product has.
 *
 * Project ownership travels in a signed httpOnly cookie, so a harness using
 * bare fetch would be a different visitor on every request and would fail the
 * ownership check for reasons no real user could hit. Carrying cookies makes
 * each case one browser, which is what is actually being tested.
 */
function newJar() {
  return new Map();
}

function jarHeader(jar) {
  if (!jar || jar.size === 0) return {};
  return { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
}

function storeCookies(jar, res) {
  if (!jar) return;
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}

async function req(url, init = {}, jar = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), ...jarHeader(jar) },
      signal: controller.signal,
    });
    storeCookies(jar, res);
    return res;
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
  const jar = newJar();
  try {
    // 1. Analyze
    let t = Date.now();
    let res = await req(`${BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c.body),
    }, jar);
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
    }, jar);
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
    }, jar);
    d = await json(res);
    if (!res.ok || !d.analysis?.next_hypothesis) {
      throw new Error(`learning: ${d.error || res.status}`);
    }
    steps.learning = ms(t);

    // 6. V3 proposal — must be a reviewable diff, and must NOT deploy itself
    t = Date.now();
    res = await req(`${BASE}/api/experiments/${experimentId}/v3`, { method: "POST" }, jar);
    d = await json(res);
    if (!res.ok || !d.proposal) throw new Error(`v3 propose: ${d.error || res.status}`);
    if (d.approved !== false) throw new Error("v3 propose: returned as approved without asking");
    if (!Array.isArray(d.proposal.changes)) throw new Error("v3 propose: no change list");
    for (const ch of d.proposal.changes) {
      // The diff is what a human approves on. A change whose "before" equals
      // its "after" would mean the diff is decorative rather than computed.
      if (ch.before === ch.after) throw new Error(`v3 propose: no-op change on ${ch.field}`);
    }
    steps.v3 = `${ms(t)}/${d.proposal.changes.length} changes`;

    // 7. A different browser must NOT be able to deploy this founder's pages.
    //    Checked before the real approval, so a boundary that silently stopped
    //    working would fail the case rather than pass it quietly.
    if (process.env.OWNER_SECRET) {
      const stranger = await req(`${BASE}/api/experiments/${experimentId}/v3`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: true }),
      }, newJar());
      if (stranger.status !== 403) {
        throw new Error(`ownership: a stranger got HTTP ${stranger.status}, expected 403`);
      }
      steps.guarded = "403";
    }

    // 8. Approval deploys a NEW experiment — this is the loop closing
    t = Date.now();
    res = await req(`${BASE}/api/experiments/${experimentId}/v3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    }, jar);
    d = await json(res);
    if (!res.ok || !d.experimentId) throw new Error(`v3 approve: ${d.error || res.status}`);
    if (d.experimentId === experimentId) throw new Error("v3 approve: reused the old experiment");
    if (d.variants?.length !== 2) throw new Error(`v3 approve: expected 2 variants`);
    const nextExperimentId = d.experimentId;
    for (const v of ["a", "b"]) {
      const r = await req(`${BASE}/e/${nextExperimentId}/${v}`);
      if (!r.ok) throw new Error(`v3 variant ${v} page: HTTP ${r.status}`);
    }
    steps.v3deploy = ms(t);

    // 9. Resume from a cold start (Memory)
    t = Date.now();
    res = await req(`${BASE}/api/projects/${projectId}`, {}, jar);
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
