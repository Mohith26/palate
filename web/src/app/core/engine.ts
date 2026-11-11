// TypeScript mirror of server/ranking/engine.py and taste.py.
// The browser demo runs entirely on this; the Django API runs the Python version.

export type Band = 'liked' | 'fine' | 'disliked';
export type Choice = 'new' | 'existing' | 'tie';

export const BANDS: Record<Band, [number, number]> = {
  liked: [6.7, 10.0],
  fine: [3.4, 6.6],
  disliked: [0.0, 3.3],
};
export const BAND_ORDER: Band[] = ['liked', 'fine', 'disliked'];

export class InsertState {
  lo = 0;
  hi: number;
  comparisons = 0;
  finalPosition: number | null = null;

  constructor(readonly n: number) {
    this.hi = n;
    if (n === 0) this.finalPosition = 0;
  }

  get done(): boolean {
    return this.finalPosition !== null;
  }

  nextIndex(): number | null {
    return this.done ? null : Math.floor((this.lo + this.hi) / 2);
  }

  answer(choice: Choice): void {
    if (this.done) throw new Error('insertion already finished');
    if (choice !== 'new' && choice !== 'existing' && choice !== 'tie') throw new Error(`bad choice ${choice}`);
    const mid = Math.floor((this.lo + this.hi) / 2);
    this.comparisons++;
    if (choice === 'tie') {
      this.finalPosition = mid;
      return;
    }
    if (choice === 'new') this.hi = mid;
    else this.lo = mid + 1;
    if (this.lo >= this.hi) this.finalPosition = this.lo;
  }
}

/** Worst case comparisons for binary insertion into n items: ceil(log2(n + 1)). */
export function maxComparisons(n: number): number {
  return n > 0 ? Math.floor(Math.log2(n)) + 1 : 0;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function bandScores(k: number, band: Band): number[] {
  const [lo, hi] = BANDS[band];
  return Array.from({ length: k }, (_, i) => round1(lo + ((hi - lo) * (k - i)) / k));
}

export function scoreLists<T>(lists: Partial<Record<Band, T[]>>): { item: T; band: Band; score: number }[] {
  const out: { item: T; band: Band; score: number }[] = [];
  for (const band of BAND_ORDER) {
    const items = lists[band] ?? [];
    const scores = bandScores(items.length, band);
    items.forEach((item, i) => out.push({ item, band, score: scores[i] }));
  }
  return out;
}

export function kendallTau(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  let conc = 0, disc = 0, tiesA = 0, tiesB = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const da = a[i] - a[j];
      const db = b[i] - b[j];
      if (da === 0 && db === 0) continue;
      if (da === 0) tiesA++;
      else if (db === 0) tiesB++;
      else if (da > 0 === db > 0) conc++;
      else disc++;
    }
  }
  const denom = Math.sqrt((conc + disc + tiesA) * (conc + disc + tiesB));
  return denom ? (conc - disc) / denom : 0;
}

export type ScoreMap = Map<number, number>;

export function similarity(mine: ScoreMap, theirs: ScoreMap, shrink = 5): { sim: number; overlap: number } {
  const shared = [...mine.keys()].filter((p) => theirs.has(p));
  if (shared.length < 2) return { sim: 0, overlap: shared.length };
  const tau = kendallTau(shared.map((p) => mine.get(p)!), shared.map((p) => theirs.get(p)!));
  return { sim: (tau * shared.length) / (shared.length + shrink), overlap: shared.length };
}

export function recommend(mine: ScoreMap, friends: ScoreMap[], k = 10, shrink = 5) {
  const num = new Map<number, number>();
  const den = new Map<number, number>();
  for (const theirs of friends) {
    const { sim } = similarity(mine, theirs, shrink);
    if (sim <= 0) continue;
    for (const [p, s] of theirs) {
      if (mine.has(p)) continue;
      num.set(p, (num.get(p) ?? 0) + sim * s);
      den.set(p, (den.get(p) ?? 0) + sim);
    }
  }
  const scored = [...num.keys()].map((p) => ({
    placeId: p,
    predicted: (num.get(p)! + 0.5 * 5) / (den.get(p)! + 0.5),
    support: den.get(p)!,
  }));
  scored.sort((x, y) => y.predicted - x.predicted || y.support - x.support);
  return scored.slice(0, k);
}
