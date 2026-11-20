import { LocalBackend, Place } from './store';
import { simulateExperiment } from './simulate';
import { analyze } from './stats';

const places: Place[] = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, name: `Spot ${i + 1}`, cuisine: i % 3 ? 'Thai' : 'Pizza' }));

describe('LocalBackend', () => {
  it('runs the same insert contract as the API and keeps a sorted list', () => {
    const b = new LocalBackend(places);
    const truth = (id: number) => (id * 37) % 101;
    for (let id = 1; id <= 30; id++) {
      let s = b.startInsert(id, 'liked');
      while (s.status === 'open') s = b.answer(s.id, truth(id) > truth(s.compare_with!.id) ? 'new' : 'existing');
      expect(s.comparisons).toBeLessThanOrEqual(s.max_comparisons);
    }
    const ids = b.list().map((e) => e.place.id);
    expect(ids).toEqual([...ids].sort((x, y) => truth(y) - truth(x)));
    expect(b.list()[0].score).toBe(10);
    expect(() => b.startInsert(1, 'fine')).toThrow();
  });

  it('cancels an open session when a new one starts', () => {
    const b = new LocalBackend(places);
    b.startInsert(1, 'fine');
    b.startInsert(2, 'fine');
    const s3 = b.startInsert(3, 'fine');
    b.startInsert(4, 'fine');
    expect(() => b.answer(s3.id, 'new')).toThrow();
  });

  it('has three seeded friends and recommends places you have not ranked', () => {
    const b = new LocalBackend(places);
    for (let id = 1; id <= 40; id++) {
      let s = b.startInsert(id, id % 2 ? 'liked' : 'fine');
      while (s.status === 'open') s = b.answer(s.id, 'existing');
    }
    expect(b.taste().length).toBe(3);
    const mine = new Set(b.list().map((e) => e.place.id));
    for (const r of b.recommendations()) expect(mine.has(r.place.id)).toBe(false);
  });
});

describe('demo experiment simulator', () => {
  it('detects a large lift and reports CUPED variance reduction', () => {
    const d = simulateExperiment(11, 3000, 0.3);
    const r = analyze(d.c, d.t, d.cPre, d.tPre, 0.05, 20);
    expect(r.decision).toBe('ship');
    expect(r.varianceReduction!).toBeGreaterThan(0.3);
  });
});

describe('demo polish', () => {
  it('tidies DOHMH title-casing in names', async () => {
    const { tidyName } = await import('./meta');
    expect(tidyName("Mama'S Pizza")).toBe("Mama's Pizza");
    expect(tidyName("O'Donoghue'S")).toBe("O'Donoghue's");
    expect(tidyName('7Th Street Burger')).toBe('7th Street Burger');
    expect(tidyName('Holiday Inn Express Nyc')).toBe('Holiday Inn Express NYC');
  });

  it('round-trips lists through export/import and drops unknown ids', () => {
    const b = new LocalBackend(places);
    for (const id of [5, 6, 7]) {
      let s = b.startInsert(id, 'fine');
      while (s.status === 'open') s = b.answer(s.id, 'existing');
    }
    const saved = b.exportLists();
    const b2 = new LocalBackend(places);
    b2.importLists({ ...saved, liked: [9999] });
    expect(b2.list()).toEqual(b.list());
  });

  it('exposes the live search window on open sessions', () => {
    const b = new LocalBackend(places);
    for (let id = 1; id <= 7; id++) {
      let s = b.startInsert(id, 'liked');
      while (s.status === 'open') s = b.answer(s.id, 'existing');
    }
    const s = b.startInsert(8, 'liked');
    expect([s.lo, s.hi]).toEqual([0, 7]);
    const s2 = b.answer(s.id, 'new');
    expect([s2.lo, s2.hi]).toEqual([0, 3]);
  });
});
