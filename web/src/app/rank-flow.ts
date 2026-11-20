import { Component, HostListener, inject, signal } from '@angular/core';
import { Band } from './core/engine';
import { emoji, cuisineLabel } from './core/meta';
import { Place, Session, Store } from './core/store';
import { CountUp, Meta, Tile } from './ui';

const CHIPS = ['American', 'Japanese', 'Italian', 'Chinese', 'Pizza', 'Mexican', 'French', 'Thai', 'Indian', 'Korean'];
export const BAND_LABEL: Record<Band, string> = { liked: 'Liked it', fine: 'It was fine', disliked: "Didn't like it" };

@Component({
  selector: 'app-rank-flow',
  imports: [Tile, Meta, CountUp],
  template: `
    @if (store.session(); as s) {
      @if (s.status === 'open' && s.compare_with) {
        <section class="h2h" aria-label="head to head">
          <div class="h2h-top">
            <p class="eyebrow">Question {{ s.comparisons + 1 }} of at most {{ s.max_comparisons }}</p>
            <div class="dots" aria-hidden="true">
              @for (d of range(s.max_comparisons); track d) {
                <i [class.on]="d < s.comparisons" [class.cur]="d === s.comparisons"></i>
              }
            </div>
          </div>
          <h2>Which did you like more?</h2>
          @for (k of [s.comparisons]; track k) {
            <div class="cards">
              <button class="card new" (click)="store.answer('new')">
                <span class="tag">New</span>
                <app-tile [cuisine]="s.place.cuisine" size="lg" />
                <span class="name">{{ s.place.name }}</span>
                <app-meta [place]="s.place" />
                <kbd class="key">&larr;</kbd>
              </button>
              <span class="vs">or</span>
              <button class="card old" (click)="store.answer('existing')">
                <span class="tag">#{{ mid(s) + 1 }} of {{ s.band_size }}</span>
                <app-tile [cuisine]="s.compare_with.cuisine" size="lg" />
                <span class="name">{{ s.compare_with.name }}</span>
                <app-meta [place]="s.compare_with" />
                <kbd class="key">&rarr;</kbd>
              </button>
            </div>
          }
          <div class="h2h-foot">
            <button class="tie" (click)="store.answer('tie')">Too close to call <kbd>&darr;</kbd></button>
            <button class="link" (click)="store.closeSession()">Cancel</button>
          </div>
        </section>
      } @else {
        <section class="done">
          <div [class]="'ring ' + s.band">
            <app-count [to]="scoreOf(s.place.id)" [decimals]="1" />
          </div>
          <h2>Placed {{ s.place.name }}</h2>
          @if (store.placedRank(s.place.id); as r) {
            <p class="done-sub">#{{ r }} of {{ store.count() }} on your list &middot; {{ bandLabel(s.band) }}</p>
          }
          <p class="done-q">{{ s.comparisons }} question{{ s.comparisons === 1 ? '' : 's' }} for a band of {{ s.band_size }}.</p>
          @if (s.band_size > 2) {
            <p class="muted small">Scrolling that band from the top would have asked up to {{ s.band_size }}.</p>
          }
          <div class="row-btns">
            <button class="btn primary" (click)="store.closeSession()">Rank another</button>
            <button class="btn" (click)="store.closeSession(); store.tab.set('list')">See my list</button>
          </div>
        </section>
      }
    } @else if (picked(); as p) {
      <section class="band">
        <div class="picked">
          <app-tile [cuisine]="p.cuisine" size="lg" />
          <div>
            <h2>How was {{ p.name }}?</h2>
            <app-meta [place]="p" />
          </div>
        </div>
        <div class="bands">
          <button class="liked" (click)="go(p, 'liked')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4"/><circle cx="9" cy="10" r=".9" class="f"/><circle cx="15" cy="10" r=".9" class="f"/></svg>
            <span>I liked it</span><small>6.7 to 10</small>
          </button>
          <button class="fine" (click)="go(p, 'fine')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8.5 15h7"/><circle cx="9" cy="10" r=".9" class="f"/><circle cx="15" cy="10" r=".9" class="f"/></svg>
            <span>It was fine</span><small>3.4 to 6.6</small>
          </button>
          <button class="disliked" (click)="go(p, 'disliked')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 16.4c1-1.6 2.4-2.4 4-2.4s3 .8 4 2.4"/><circle cx="9" cy="10" r=".9" class="f"/><circle cx="15" cy="10" r=".9" class="f"/></svg>
            <span>I didn't like it</span><small>0 to 3.3</small>
          </button>
        </div>
        <button class="link" (click)="picked.set(null)">&larr; Back to search</button>
      </section>
    } @else {
      <section class="search">
        <div class="flow-head">
          <h2>Rank a place you've been</h2>
          <span class="muted small">{{ store.count() }} ranked</span>
        </div>
        <label class="search-box">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input placeholder="Search Manhattan restaurants or a cuisine" [value]="store.query()" (input)="store.search($any($event.target).value)" />
        </label>
        <div class="chips">
          @for (c of chips; track c) {
            <button class="chip" [class.on]="store.query() === c" (click)="store.search(store.query() === c ? '' : c)">
              <span aria-hidden="true">{{ glyph(c) }}</span>{{ label(c) }}
            </button>
          }
        </div>
        @if (store.count() === 0 && store.canSeed) {
          <div class="seed">
            <div>
              <b>New here?</b>
              <span>Load a simulated diner's 12-place list, ranked through the same engine, to see scores, taste match and recommendations right away.</span>
            </div>
            <button class="btn primary sm" (click)="seed()">Load sample list</button>
          </div>
        }
        <ul class="results">
          @for (p of store.results(); track p.id) {
            <li>
              <button (click)="picked.set(p)">
                <app-tile [cuisine]="p.cuisine" />
                <span class="r-main"><b>{{ p.name }}</b><app-meta [place]="p" /></span>
                <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
              </button>
            </li>
          } @empty {
            <li class="empty">No unranked places match "{{ store.query() }}".</li>
          }
        </ul>
      </section>
    }
  `,
})
export class RankFlow {
  readonly store = inject(Store);
  readonly picked = signal<Place | null>(null);
  readonly chips = CHIPS;

  async go(p: Place, band: Band) {
    this.picked.set(null);
    await this.store.start(p, band);
  }

  async seed() {
    await this.store.seedSample();
  }

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  mid(s: Session): number {
    return Math.floor(((s.lo ?? 0) + (s.hi ?? s.band_size)) / 2);
  }

  bandLabel(b: Band): string {
    return BAND_LABEL[b];
  }

  glyph(c: string) {
    return emoji(c);
  }

  label(c: string) {
    return cuisineLabel(c);
  }

  scoreOf(id: number): number {
    return this.store.entries().find((e) => e.place.id === id)?.score ?? 0;
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent) {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const s = this.store.session();
    if (!s) return;
    if (s.status === 'open' && s.compare_with) {
      const map: Record<string, 'new' | 'existing' | 'tie'> = { ArrowLeft: 'new', ArrowRight: 'existing', ArrowDown: 'tie' };
      const c = map[ev.key];
      if (c) {
        ev.preventDefault();
        this.store.answer(c);
      }
    } else if (ev.key === 'Enter' || ev.key === 'Escape') {
      this.store.closeSession();
    }
  }
}
