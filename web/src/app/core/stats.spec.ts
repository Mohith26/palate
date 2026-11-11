import { analyze, msprtP, naiveP, normSf } from './stats';
import { PY } from './py-fixtures';

describe('stats parity with Python', () => {
  it('normal tail is accurate', () => {
    expect(normSf(1.959963984540054)).toBeCloseTo(0.025, 6);
    expect(normSf(0)).toBeCloseTo(0.5, 7);
  });

  it('naive p matches scipy', () => {
    for (const [d, V, p] of PY.naive_cases) expect(Math.abs(naiveP(d, V) - p)).toBeLessThan(1e-6);
  });

  it('mSPRT p matches Python', () => {
    for (const [d, V, t2, p] of PY.msprt_cases) expect(Math.abs(msprtP(d, V, t2) - p) / p).toBeLessThan(1e-9);
  });

  it('full analyze with CUPED matches Python', () => {
    const r = analyze(PY.c, PY.t, PY.cPre, PY.tPre, 0.05, 5);
    expect(r.delta).toBeCloseTo(PY.delta, 9);
    expect(r.varianceReduction!).toBeCloseTo(PY.vr, 9);
    expect(Math.abs(r.pNaive - PY.pNaive)).toBeLessThan(1e-6);
    expect(Math.abs(r.pAlwaysValid - PY.pAlwaysValid)).toBeLessThan(1e-6);
  });

  it('always-valid p never increases across looks', () => {
    const r = analyze(PY.c, PY.t, undefined, undefined, 0.05, 10);
    for (let i = 1; i < r.looks.length; i++) expect(r.looks[i].pAlwaysValid).toBeLessThanOrEqual(r.looks[i - 1].pAlwaysValid);
    expect(() => analyze([1, 2], [3, 4])).toThrow();
  });
});
