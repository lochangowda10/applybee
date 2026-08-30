/**
 * Proves the free tier actually gates, and that joining the waitlist lifts it.
 *
 * Deliberately separate from scripts/e2e.mjs: that harness runs six full loops
 * from one address, which the free tier is supposed to refuse. Running them
 * together would either break the harness or prove the quota does nothing.
 *
 *   node scripts/quota-check.mjs http://localhost:3100
 *
 * Blocked requests are answered before any model is called, so a failed run
 * here costs nothing but the passes.
 */

const BASE = process.argv[2] || 'http://localhost:3100';

const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function store(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const at = pair.indexOf('=');
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader() },
    body: JSON.stringify(body),
  });
  store(res);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON body; status is what matters */
  }
  return { status: res.status, data };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const analyze = (n) =>
  post('/api/analyze', {
    input: `A small tool that keeps track of recurring invoices for freelancers, run ${n}`,
  });

console.log(`quota check against ${BASE}\n`);

// 1. The first free experiment goes through.
const first = await analyze(1);
check(
  'first experiment allowed',
  first.status === 200 && Boolean(first.data.projectId),
  `HTTP ${first.status}`
);

// 2. The second is refused by the weekly gate, and the refusal offers the fix.
const second = await analyze(2);
const q = second.data.quota ?? {};
check(
  'second experiment blocked in the same week',
  second.status === 429 && q.scope === 'week',
  `HTTP ${second.status}, scope=${q.scope}`
);
check(
  'refusal offers the waitlist',
  q.signupWouldHelp === true,
  `signupWouldHelp=${q.signupWouldHelp}`
);
check(
  'refusal names the limit in words',
  typeof second.data.error === 'string' && /free experiment/i.test(second.data.error),
  JSON.stringify(second.data.error)
);
check(
  'blocked request created nothing',
  !second.data.projectId,
  second.data.projectId ? 'a project was created anyway' : 'no project row'
);

// 3. Joining the waitlist.
const signup = await post('/api/interest', {
  email: `quota-check-${Date.now()}@example.com`,
  plan: 'starter',
});
check('waitlist signup recorded', signup.status === 200 && signup.data.recorded === true, `HTTP ${signup.status}`);
check('signup set the cookie', jar.has('ll_signup'), jar.has('ll_signup') ? 'll_signup present' : 'no cookie');

// 4. The gate is lifted immediately.
const third = await analyze(3);
check(
  'signed up, the weekly gate is lifted',
  third.status === 200 && Boolean(third.data.projectId),
  `HTTP ${third.status}${third.data.error ? ` — ${third.data.error}` : ''}`
);

// 5. The quota endpoint agrees with what just happened.
const view = await fetch(`${BASE}/api/quota`, { headers: { cookie: cookieHeader() } });
const state = await view.json();
check(
  'quota endpoint reports the signup',
  state.signedUp === true,
  `signedUp=${state.signedUp}, used this month=${state.usedMonth}/${state.limitMonth}`
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
