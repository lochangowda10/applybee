/**
 * What the product costs. One definition, used everywhere.
 *
 * These numbers used to be typed out separately in the pricing table, in the
 * plan picker, and in the server-side total the counter displays. Three copies
 * of a number is three chances for the page to promise one price while the
 * server counts another, which is the same class of problem as a pricing page
 * that states a free tier nothing enforces. Everything reads from here.
 *
 * Rupees are held as their own figure rather than converted at request time.
 * A live rate would make the displayed price move between two page loads for
 * no reason the buyer can see, and an Indian customer is quoted in rupees —
 * it is the price, not a translation of one. The rate below is the one used
 * to set them, stated so the pair is checkable rather than arbitrary.
 */

/** The rate these rupee prices were set at. Shown on the page, not applied. */
export const USD_TO_INR = 88;

export type Plan = {
  id: 'starter' | 'growth';
  name: string;
  usd: number;
  inr: number;
  experiments: number;
  points: string[];
};

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    usd: 5,
    inr: 440,
    experiments: 10,
    points: ['Everything in Free', 'Experiments never expire', 'Referral attribution'],
  },
  {
    id: 'growth',
    name: 'Growth',
    usd: 20,
    inr: 1760,
    experiments: 50,
    points: ['Everything in Starter', 'Priority generation', 'Export results as CSV'],
  },
];

export const PLAN_IDS = new Set(PLANS.map((p) => p.id));

export function planById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Formats a rupee figure the way it is read in India — 1,760 not 1760. */
export function inr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function usd(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

/**
 * Per-experiment price, to two decimals.
 *
 * Kept as a function rather than a stored figure so it cannot disagree with
 * the plan it is derived from — the one number here that is genuinely a
 * calculation rather than a decision.
 */
export function perExperimentUsd(plan: Plan): string {
  return `$${(plan.usd / plan.experiments).toFixed(2)}`;
}

export function perExperimentInr(plan: Plan): string {
  return `₹${Math.round(plan.inr / plan.experiments)}`;
}

/** What people have said they would pay, in both currencies. */
export function committedValue(byPlan: Record<string, number>): {
  usd: number;
  inr: number;
} {
  let totalUsd = 0;
  let totalInr = 0;
  for (const plan of PLANS) {
    const n = byPlan[plan.id] ?? 0;
    totalUsd += n * plan.usd;
    totalInr += n * plan.inr;
  }
  return { usd: totalUsd, inr: totalInr };
}
