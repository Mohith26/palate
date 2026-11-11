import { bandScores, InsertState, kendallTau, maxComparisons, recommend, scoreLists, similarity } from './engine';
import { seeded } from './store';
import { PY } from './py-fixtures';

function insertAll(values: number[]) {
  const list: number[] = [];
  let worst = 0;
  for (const v of values) {
    const st = new InsertState(list.length);
    while (!st.done) st.answer(v > list[st.nextIndex()!] ? 'new' : 'existing');
    expect(st.comparisons).toBeLessThanOrEqual(maxComparisons(list.length));
    worst = Math.max(worst, st.comparisons);
    list.splice(st.finalPosition!, 0, v);
  }
  return { list, worst };
}

describe('InsertState', () => {
  it('sorts with an honest chooser within ceil(log2(n+1)) comparisons', () => {
    const rnd = seeded(3);
    const vals = Array.from({ length: 300 }, () => rnd());
    const { list, worst } = insertAll(vals);
    expect(list).toEqual([...vals].sort((a, b) => b - a));
    expect(worst).toBeLessThanOrEqual(9);
  });

  it('matches Python max_comparisons', () => {
    expect([0, 1, 2, 3, 4, 7, 8, 1023, 1024].map(maxComparisons)).toEqual([0, 1, 2, 2, 3, 3, 4, 10, 11]);
  });

  it('tie ends early above the opponent', () => {
    const st = new InsertState(9);
    const mid = st.nextIndex();
    st.answer('tie');
    expect(st.done).toBe(true);
    expect(st.finalPosition).toBe(mid);
  });

  it('rejects answers after finishing and bad choices', () => {
    const st = new InsertState(0);
    expect(st.done).toBe(true);
    expect(() => st.answer('new')).toThrow();
    expect(() => new InsertState(4).answer('meh' as never)).toThrow();
  });
});

describe('scores and taste', () => {
  it('band scores match Python', () => {
    expect(bandScores(7, 'fine')).toEqual(PY.band_fine_7);
    expect(bandScores(1, 'liked')).toEqual([10]);
  });

  it('score lists order liked, fine, disliked', () => {
    const out = scoreLists({ disliked: [3], liked: [1], fine: [2] });
    expect(out.map((e) => e.item)).toEqual([1, 2, 3]);
  });

  it('kendall tau matches Python', () => {
    const [a, b, tau] = PY.tau_case as unknown as [number[], number[], number];
    expect(kendallTau(a, b)).toBeCloseTo(tau, 12);
  });

  it('similarity shrinks small overlaps and recommend skips dissimilar friends', () => {
    const me = new Map([[1, 10], [2, 8], [3, 6], [4, 4]]);
    const twin = new Map([[1, 9], [2, 7], [3, 5], [4, 3], [100, 9.8]]);
    const opposite = new Map([[1, 2], [2, 4], [3, 6], [4, 8], [200, 9.9]]);
    expect(similarity(me, twin).sim).toBeCloseTo(4 / 9, 9);
    expect(recommend(me, [twin, opposite]).map((r) => r.placeId)).toEqual([100]);
  });
});
