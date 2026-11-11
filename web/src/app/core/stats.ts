// TypeScript mirror of server/experiments/stats.py (naive z-test, CUPED, mSPRT).

/** Complementary error function (Numerical Recipes erfcc, fractional error under 1.2e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
        t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

export function normSf(x: number): number {
  return 0.5 * erfc(x / Math.SQRT2);
}

export function naiveP(delta: number, V: number): number {
  return 2 * normSf(Math.abs(delta) / Math.sqrt(V));
}

export function msprtLogLambda(delta: number, V: number, tau2: number): number {
  return 0.5 * Math.log(V / (V + tau2)) + (delta * delta * tau2) / (2 * V * (V + tau2));
}

export function msprtP(delta: number, V: number, tau2: number): number {
  return Math.min(1, Math.exp(-msprtLogLambda(delta, V, tau2)));
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const varS = (a: number[]) => {
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
};

export function diffAndVar(c: number[], t: number[]): { d: number; V: number } {
  return { d: mean(t) - mean(c), V: varS(c) / c.length + varS(t) / t.length };
}

export function cupedTheta(y: number[], x: number[]): number {
  const mx = mean(x), my = mean(y);
  let cov = 0, vx = 0;
  for (let i = 0; i < x.length; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    vx += (x[i] - mx) ** 2;
  }
  return vx > 0 ? cov / vx : 0;
}

export interface Look { look: number; n: number; delta: number; pNaive: number; pAlwaysValid: number }

export interface Report {
  delta: number;
  pNaive: number;
  pAlwaysValid: number;
  varianceReduction: number | null;
  decision: 'ship' | 'revert' | 'keep running';
  looks: Look[];
}

export function analyze(c: number[], t: number[], cPre?: number[], tPre?: number[], alpha = 0.05, looks = 10): Report {
  if (c.length < 3 || t.length < 3) throw new Error('need at least 3 units per arm');
  const cuped = !!(cPre && tPre);
  let tau2: number | null = null;
  let pSeq = 1;
  const trace: Look[] = [];
  let last = { d: 0, V: 1 };
  let vr: number | null = null;
  for (let k = 1; k <= looks; k++) {
    const nc = Math.max(3, Math.round((c.length * k) / looks));
    const nt = Math.max(3, Math.round((t.length * k) / looks));
    let cy = c.slice(0, nc), ty = t.slice(0, nt);
    if (cuped) {
      const xc = cPre!.slice(0, nc), xt = tPre!.slice(0, nt);
      const xAll = [...xc, ...xt];
      const theta = cupedTheta([...cy, ...ty], xAll);
      const xm = mean(xAll);
      const raw = diffAndVar(cy, ty).V;
      cy = cy.map((y, i) => y - theta * (xc[i] - xm));
      ty = ty.map((y, i) => y - theta * (xt[i] - xm));
      vr = 1 - diffAndVar(cy, ty).V / raw;
    }
    last = diffAndVar(cy, ty);
    if (tau2 === null) {
      const sd = Math.sqrt((varS(cy) + varS(ty)) / 2);
      tau2 = sd > 0 ? (0.1 * sd) ** 2 : 1;
    }
    pSeq = Math.min(pSeq, msprtP(last.d, last.V, tau2));
    trace.push({ look: k, n: nc + nt, delta: last.d, pNaive: naiveP(last.d, last.V), pAlwaysValid: pSeq });
  }
  return {
    delta: last.d,
    pNaive: naiveP(last.d, last.V),
    pAlwaysValid: pSeq,
    varianceReduction: vr,
    decision: pSeq < alpha ? (last.d > 0 ? 'ship' : 'revert') : 'keep running',
    looks: trace,
  };
}
