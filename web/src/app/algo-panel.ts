import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Store } from './core/store';
import { BAND_LABEL } from './rank-flow';

interface Row { key: number; i: number; name: string; score: number; out: boolean; mid: boolean; isNew: boolean }

/** Live view of the binary insertion: the band, the shrinking search window, and each answer. */
@Component({
  selector: 'app-algo-panel',
  imports: [DecimalPipe],
  template: `
    <aside class="panel algo">
      <header class="panel-h">
        <h3>Under the hood</h3>
        @if (open()) {
          <span class="live"><i></i>Live</span>
        }
      </header>
      @if (store.session(); as s) {
        <p class="algo-lead">
          Binary insertion into your <b [class]="'bt ' + s.band">{{ bandLabel() }}</b> band.
          @if (open()) {
            Placing <b>{{ s.place.name }}</b>.
          }
        </p>
        <div class="algo-stats">
          <div><span class="k">Search window</span><b>{{ windowSize() }}</b><small>of {{ s.band_size }} places</small></div>
          <div><span class="k">Questions</span><b>{{ s.comparisons }}</b><small>max {{ s.max_comparisons }}</small></div>
          <div><span class="k">Scrolling</span><b>{{ s.band_size }}</b><small>worst case</small></div>
        </div>
        @if (rows().length) {
          <div class="ladder" [class.dense]="rows().length > 12">
            @for (r of rows(); track r.key) {
              <div class="slot" [class.out]="r.out" [class.mid]="r.mid" [class.new]="r.isNew">
                <span class="pos">{{ r.i + 1 }}</span>
                <span class="nm">{{ r.name }}</span>
                <span class="sc">{{ r.score | number: '1.1-1' }}</span>
                @if (r.mid) {
                  <span class="flag">comparing</span>
                }
                @if (r.isNew) {
                  <span class="flag">new</span>
                }
              </div>
            }
          </div>
        } @else {
          <p class="muted small">This band was empty, so the place went straight in with zero questions.</p>
        }
        @if (store.trail().length) {
          <ol class="trail">
            @for (t of store.trail(); track $index) {
              <li>
                <span class="q">Q{{ $index + 1 }}</span>
                vs {{ t.vs.name }}:
                <b>{{ t.choice === 'new' ? 'new place wins' : t.choice === 'existing' ? 'theirs wins' : 'too close' }}</b>
                <span class="muted">window {{ t.hi - t.lo }} &rarr; {{ after($index) }}</span>
              </li>
            }
          </ol>
        }
      } @else {
        <p class="algo-lead">Your rank sets your score.</p>
        <div class="scale">
          <div class="seg disliked"></div>
          <div class="seg fine"></div>
          <div class="seg liked"></div>
          @for (e of store.entries(); track e.place.id) {
            <i [class]="'pin ' + e.band" [style.left.%]="e.score * 10" [title]="e.place.name + ' ' + e.score"></i>
          }
        </div>
        <div class="scale-l"><span>0</span><span>3.4</span><span>6.7</span><span>10</span></div>
        <ol class="how">
          <li><b>Pick a band.</b> Liked, fine or didn't like. Each band owns a slice of the 0 to 10 scale.</li>
          <li><b>Answer head-to-heads.</b> Each answer halves the search window, so a place lands in at most &lceil;log&#8322;(n+1)&rceil; questions.</li>
          <li><b>Score from rank.</b> Your #1 is always 10.0, and scores re-space as the list grows.</li>
        </ol>
        <div class="callout">
          On a 100-place list a new place takes <b>6.7</b> questions on average, versus <b>51.4</b> scrolling from the top.
          <span class="muted">Simulated, results.json</span>
        </div>
      }
    </aside>
  `,
})
export class AlgoPanel {
  readonly store = inject(Store);
  readonly open = computed(() => this.store.session()?.status === 'open');
  readonly bandLabel = computed(() => {
    const s = this.store.session();
    return s ? BAND_LABEL[s.band].toLowerCase() : '';
  });
  readonly windowSize = computed(() => {
    const s = this.store.session();
    if (!s) return 0;
    if (s.status !== 'open') return 1;
    return (s.hi ?? s.band_size) - (s.lo ?? 0);
  });
  readonly rows = computed<Row[]>(() => {
    const s = this.store.session();
    if (!s) return [];
    const band = this.store.entries().filter((e) => e.band === s.band);
    if (s.status !== 'open') {
      return band.map((e, i) => ({ key: e.place.id, i, name: e.place.name, score: e.score, out: e.place.id !== s.place.id, mid: false, isNew: e.place.id === s.place.id }));
    }
    const lo = s.lo ?? 0, hi = s.hi ?? band.length;
    const mid = Math.floor((lo + hi) / 2);
    return band.map((e, i) => ({ key: e.place.id, i, name: e.place.name, score: e.score, out: i < lo || i >= hi, mid: i === mid, isNew: false }));
  });

  after(i: number): number | string {
    const t = this.store.trail();
    if (i + 1 < t.length) return t[i + 1].hi - t[i + 1].lo;
    const s = this.store.session();
    if (!s || s.status !== 'open') return 'placed';
    return (s.hi ?? s.band_size) - (s.lo ?? 0);
  }
}
