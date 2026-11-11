import { Injectable, computed, signal } from '@angular/core';
import { Band, BAND_ORDER, Choice, InsertState, maxComparisons, recommend, ScoreMap, scoreLists, similarity } from './engine';

export interface Place { id: number; name: string; cuisine: string; zipcode?: string }
export interface Entry { rank: number; band: Band; score: number; place: Place }
export interface Session {
  id: number;
  place: Place;
  band: Band;
  status: 'open' | 'done' | 'cancelled';
  comparisons: number;
  band_size: number;
  max_comparisons: number;
  compare_with: Place | null;
}
export interface FriendTaste { handle: string; similarity: number; overlap: number }
export interface Rec { place: Place; predicted_score: number; support: number }

/** Mulberry32: tiny seeded PRNG so the demo friends are the same on every load. */
export function seeded(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * In-browser backend used by the static demo (GitHub Pages). Same contract as the Django API.
 * Friends are synthetic: each has a hidden cuisine taste and ranks 40 places with it.
 */
export class LocalBackend {
  private lists: Record<Band, number[]> = { liked: [], fine: [], disliked: [] };
  private sessions = new Map<number, { state: InsertState; place: Place; band: Band; status: Session['status'] }>();
  private nextId = 1;
  readonly friends: { handle: string; scores: ScoreMap }[] = [];

  constructor(readonly places: Place[]) {
    const rnd = seeded(42);
    const cuisines = [...new Set(places.map((p) => p.cuisine))];
    const pool = places.slice(0, 80);
    for (const handle of ['maya', 'theo', 'priya']) {
      const pref = new Map(cuisines.map((c) => [c, rnd() * 2 - 1]));
      const picks = [...pool].sort(() => rnd() - 0.5).slice(0, 40);
      const ranked = picks
        .map((p) => ({ p, u: pref.get(p.cuisine)! + (rnd() - 0.5) }))
        .sort((a, b) => b.u - a.u);
      const bands: Record<Band, number[]> = { liked: [], fine: [], disliked: [] };
      ranked.forEach(({ p, u }) => bands[u > 0.25 ? 'liked' : u < -0.5 ? 'disliked' : 'fine'].push(p.id));
      this.friends.push({ handle, scores: new Map(scoreLists(bands).map((e) => [e.item, e.score])) });
    }
  }

  private place(id: number): Place {
    const p = this.places.find((x) => x.id === id);
    if (!p) throw new Error(`unknown place ${id}`);
    return p;
  }

  scoreMap(): ScoreMap {
    return new Map(scoreLists(this.lists).map((e) => [e.item, e.score]));
  }

  list(): Entry[] {
    return scoreLists(this.lists).map((e, i) => ({ rank: i + 1, band: e.band, score: e.score, place: this.place(e.item) }));
  }

  search(q: string, limit = 12): Place[] {
    const s = q.trim().toLowerCase();
    const ranked = new Set(BAND_ORDER.flatMap((b) => this.lists[b]));
    return this.places
      .filter((p) => !ranked.has(p.id) && (!s || p.name.toLowerCase().includes(s) || p.cuisine.toLowerCase().includes(s)))
      .slice(0, limit);
  }

  private view(id: number): Session {
    const s = this.sessions.get(id)!;
    const idx = s.state.nextIndex();
    return {
      id, place: s.place, band: s.band, status: s.status, comparisons: s.state.comparisons,
      band_size: s.state.n, max_comparisons: maxComparisons(s.state.n),
      compare_with: s.status === 'open' && idx !== null ? this.place(this.lists[s.band][idx]) : null,
    };
  }

  startInsert(placeId: number, band: Band): Session {
    if (BAND_ORDER.some((b) => this.lists[b].includes(placeId))) throw new Error('already on your list');
    for (const s of this.sessions.values()) if (s.status === 'open') s.status = 'cancelled';
    const id = this.nextId++;
    const state = new InsertState(this.lists[band].length);
    this.sessions.set(id, { state, place: this.place(placeId), band, status: 'open' });
    if (state.done) this.finish(id);
    return this.view(id);
  }

  answer(sessionId: number, choice: Choice): Session {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== 'open') throw new Error('session is not open');
    s.state.answer(choice);
    if (s.state.done) this.finish(sessionId);
    return this.view(sessionId);
  }

  private finish(id: number) {
    const s = this.sessions.get(id)!;
    this.lists[s.band].splice(s.state.finalPosition!, 0, s.place.id);
    s.status = 'done';
  }

  remove(placeId: number) {
    for (const b of BAND_ORDER) this.lists[b] = this.lists[b].filter((x) => x !== placeId);
  }

  taste(): FriendTaste[] {
    const mine = this.scoreMap();
    return this.friends
      .map((f) => {
        const { sim, overlap } = similarity(mine, f.scores);
        return { handle: f.handle, similarity: Math.round(sim * 1000) / 1000, overlap };
      })
      .sort((a, b) => b.similarity - a.similarity);
  }

  recommendations(k = 10): Rec[] {
    return recommend(this.scoreMap(), this.friends.map((f) => f.scores), k).map((r) => ({
      place: this.place(r.placeId), predicted_score: Math.round(r.predicted * 100) / 100, support: r.support,
    }));
  }
}

/** Thin client for the Django API (used when ?api=http://host:port/api is set). */
export class HttpBackend {
  constructor(readonly base: string, readonly dinerId: number) {}
  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const r = await fetch(this.base + path, { headers: { 'Content-Type': 'application/json' }, ...init });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    return r.status === 204 ? (undefined as T) : r.json();
  }
  static async connect(base: string, handle: string): Promise<HttpBackend> {
    const r = await fetch(`${base}/diners/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle }) });
    return new HttpBackend(base, (await r.json()).id);
  }
  list = async () => (await this.call<{ entries: Entry[] }>(`/diners/${this.dinerId}/list/`)).entries;
  search = (q: string) => this.call<Place[]>(`/places/?limit=12&q=${encodeURIComponent(q)}`);
  startInsert = (placeId: number, band: Band) =>
    this.call<Session>(`/diners/${this.dinerId}/inserts/`, { method: 'POST', body: JSON.stringify({ place_id: placeId, band }) });
  answer = (id: number, choice: Choice) =>
    this.call<Session>(`/inserts/${id}/answer/`, { method: 'POST', body: JSON.stringify({ choice }) });
  remove = (placeId: number) => this.call<void>(`/diners/${this.dinerId}/list/${placeId}/`, { method: 'DELETE' });
  taste = () => this.call<FriendTaste[]>(`/diners/${this.dinerId}/taste/`);
  recommendations = () => this.call<Rec[]>(`/diners/${this.dinerId}/recommendations/`);
}

/** App state. Uses the Django API when ?api= is present, else the in-browser backend. */
@Injectable({ providedIn: 'root' })
export class Store {
  readonly entries = signal<Entry[]>([]);
  readonly session = signal<Session | null>(null);
  readonly results = signal<Place[]>([]);
  readonly taste = signal<FriendTaste[]>([]);
  readonly recs = signal<Rec[]>([]);
  readonly error = signal<string | null>(null);
  readonly mode = signal<'demo' | 'api'>('demo');
  readonly count = computed(() => this.entries().length);
  private local?: LocalBackend;
  private http?: HttpBackend;

  private ready = false;

  async init(places?: Place[]) {
    if (this.ready) return;
    this.ready = true;
    const api = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('api') : null;
    if (api) {
      this.http = await HttpBackend.connect(api, 'me');
      this.mode.set('api');
    } else {
      const ps = places ?? (await (await fetch('places.json')).json());
      this.local = new LocalBackend(ps);
    }
    await this.refresh();
    await this.search('');
  }

  private async run<T>(fn: () => T | Promise<T>): Promise<T | undefined> {
    try {
      this.error.set(null);
      return await fn();
    } catch (e) {
      this.error.set((e as Error).message);
      return undefined;
    }
  }

  async refresh() {
    await this.run(async () => {
      if (this.local) {
        this.entries.set(this.local.list());
        this.taste.set(this.local.taste());
        this.recs.set(this.local.recommendations());
      } else if (this.http) {
        this.entries.set(await this.http.list());
        this.taste.set(await this.http.taste());
        this.recs.set(await this.http.recommendations());
      }
    });
  }

  async search(q: string) {
    await this.run(async () => this.results.set(this.local ? this.local.search(q) : await this.http!.search(q)));
  }

  async start(place: Place, band: Band) {
    const s = await this.run(() => (this.local ? this.local.startInsert(place.id, band) : this.http!.startInsert(place.id, band)));
    if (s) this.session.set(s);
    if (s?.status === 'done') {
      await this.refresh();
      await this.search('');
    }
  }

  async answer(choice: Choice) {
    const cur = this.session();
    if (!cur) return;
    const s = await this.run(() => (this.local ? this.local.answer(cur.id, choice) : this.http!.answer(cur.id, choice)));
    if (s) this.session.set(s);
    if (s?.status === 'done') {
      await this.refresh();
      await this.search('');
    }
  }

  async remove(placeId: number) {
    await this.run(() => (this.local ? this.local.remove(placeId) : this.http!.remove(placeId)));
    await this.refresh();
  }

  closeSession() {
    this.session.set(null);
  }
}
