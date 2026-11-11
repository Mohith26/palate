import { seeded } from './store';

/** Knuth Poisson sampler (fine for small rates). */
export function poisson(rnd: () => number, lam: number): number {
  const L = Math.exp(-lam);
  let k = 0, p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > L);
  return k - 1;
}

/**
 * Simulated experiment for the demo: each diner has an engagement rate lambda ~ Exponential(mean 3);
 * pre-period and test-period "places ranked" are Poisson draws from it. Treatment multiplies the rate.
 */
export function simulateExperiment(seed: number, perArm: number, lift: number) {
  const rnd = seeded(seed);
  const arm = (l: number) => {
    const y: number[] = [], x: number[] = [];
    for (let i = 0; i < perArm; i++) {
      const lam = -Math.log(1 - rnd()) * 3;
      x.push(poisson(rnd, lam));
      y.push(poisson(rnd, lam * (1 + l)));
    }
    return { y, x };
  };
  const c = arm(0), t = arm(lift);
  return { c: c.y, t: t.y, cPre: c.x, tPre: t.x };
}
