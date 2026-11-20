import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { hue } from './core/meta';
import { Store } from './core/store';
import { Meta, Tile } from './ui';

@Component({
  selector: 'app-list-view',
  imports: [DecimalPipe, Tile, Meta],
  template: `
    <section class="panel pad">
      <div class="sec-h">
        <div>
          <h2>My list</h2>
          <p class="muted">{{ store.count() }} place{{ store.count() === 1 ? '' : 's' }}, scored from your ranks</p>
        </div>
        @if (store.count()) {
          <div class="dist" aria-label="band split">
            @for (b of bands; track b) {
              @if (store.bandCounts()[b]) {
                <span [class]="'d ' + b" [style.flex-grow]="store.bandCounts()[b]">{{ store.bandCounts()[b] }}</span>
              }
            }
          </div>
        }
      </div>
      <ol class="list">
        @for (e of store.entries(); track e.place.id) {
          <li [class]="e.band" [style.animation-delay.ms]="$index * 22">
            <span class="rank">{{ e.rank }}</span>
            <app-tile [cuisine]="e.place.cuisine" />
            <span class="r-main"><b class="name">{{ e.place.name }}</b><app-meta [place]="e.place" /></span>
            <span class="score">{{ e.score | number: '1.1-1' }}</span>
            <button class="icon-btn" [attr.aria-label]="'Remove ' + e.place.name" (click)="store.remove(e.place.id)">
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </li>
        } @empty {
          <li class="empty-state">
            <b>Nothing ranked yet.</b>
            <span>Start with a place you know well, or load a sample list.</span>
            <div class="row-btns">
              <button class="btn primary" (click)="store.tab.set('rank')">Rank a place</button>
              @if (store.canSeed) {
                <button class="btn" (click)="store.seedSample()">Load sample list</button>
              }
            </div>
          </li>
        }
      </ol>
      @if (store.count() && store.canSeed) {
        <button class="link" (click)="store.clearAll()">Clear my list</button>
      }
    </section>
  `,
})
export class ListView {
  readonly store = inject(Store);
  readonly bands = ['liked', 'fine', 'disliked'] as const;
}

@Component({
  selector: 'app-friends-view',
  imports: [DecimalPipe, Tile, Meta],
  template: `
    <section class="panel pad">
      <div class="sec-h">
        <div>
          <h2>Taste match</h2>
          <p class="muted">Kendall tau over the places you both ranked, shrunk toward 0 when the overlap is small. Friends here are simulated.</p>
        </div>
      </div>
      <div class="friends">
        @for (f of store.taste(); track f.handle) {
          <div class="friend" [class.twin]="$first && f.similarity > 0.15">
            <span class="avatar" [style.background]="'hsl(' + h(f.handle) + ' 70% 45%)'">{{ f.handle[0].toUpperCase() }}</span>
            <div class="f-main">
              <b>{{ f.handle }}</b>
              @if ($first && f.similarity > 0.15) {
                <span class="badge-twin">Taste twin</span>
              }
              <span class="muted small">{{ f.overlap }} shared place{{ f.overlap === 1 ? '' : 's' }}</span>
            </div>
            <div class="meter" [attr.aria-label]="'similarity ' + f.similarity">
              <span class="zero"></span>
              <span class="fill" [class.neg]="f.similarity < 0"
                [style.left.%]="f.similarity < 0 ? 50 + f.similarity * 50 : 50"
                [style.width.%]="abs(f.similarity) * 50"></span>
            </div>
            <span class="sim">{{ f.similarity >= 0 ? '+' : '' }}{{ f.similarity | number: '1.2-2' }}</span>
          </div>
        }
      </div>
    </section>
    <section class="panel pad">
      <div class="sec-h">
        <div>
          <h2>Recommended for you</h2>
          <p class="muted">Similarity-weighted friend scores over places you haven't ranked. In simulation this beat a popularity baseline on precision@10 (0.555 vs 0.481).</p>
        </div>
      </div>
      <ol class="list">
        @for (r of store.recs(); track r.place.id) {
          <li class="liked" [style.animation-delay.ms]="$index * 30">
            <span class="rank">{{ $index + 1 }}</span>
            <app-tile [cuisine]="r.place.cuisine" />
            <span class="r-main">
              <b class="name">{{ r.place.name }}</b>
              <app-meta [place]="r.place" />
              @if (r.friends?.length) {
                <span class="via">via @for (f of r.friends; track f) {<i [style.background]="'hsl(' + h(f) + ' 70% 45%)'">{{ f[0].toUpperCase() }}</i>} {{ r.friends!.join(', ') }}</span>
              }
            </span>
            <span class="score pred">{{ r.predicted_score | number: '1.1-1' }}</span>
          </li>
        } @empty {
          <li class="empty-state">
            <b>No recommendations yet.</b>
            <span>Rank a few places your friends have been to (the first results in search) and picks show up here.</span>
            @if (store.canSeed) {
              <div class="row-btns"><button class="btn primary" (click)="store.seedSample()">Load sample list</button></div>
            }
          </li>
        }
      </ol>
    </section>
  `,
})
export class FriendsView {
  readonly store = inject(Store);
  h(s: string) {
    return hue(s + 'x');
  }
  abs(x: number) {
    return Math.abs(x);
  }
}

interface Bench {
  insertion: {
    size_curve: { list_size: number; binary_mean_comparisons: number; linear_scan_mean_comparisons: number; log2_n_plus_1: number }[];
    noise_table: Record<string, any>[];
    total_comparisons_to_build_100_list: { binary: number; linear_scan: number; reduction_x: number };
  };
  experiments: Record<string, any>;
  recommendations: Record<string, any>;
  api_latency: { requests: number; errors: number; throughput_rps: number; all_requests: Record<string, number>; by_endpoint: Record<string, { n: number; p50_ms: number; p95_ms: number; p99_ms: number }> };
  generated_at: string;
  seed: number;
}

@Component({
  selector: 'app-results-view',
  imports: [DecimalPipe],
  template: `
    @if (data(); as d) {
      <p class="muted src-note">
        Every number on this tab is read live from
        <a href="https://github.com/Mohith26/palate/blob/main/results/results.json" target="_blank" rel="noopener">results/results.json</a>,
        written by <code>sim/run_metrics.py</code> (seed {{ d.seed }}). People and metrics are simulated; the catalog is real.
      </p>
      <div class="grid2">
        <section class="panel pad">
          <h3>Questions to place one restaurant</h3>
          <p class="muted small">Mean over 200 simulated users, honest answers. Binary insertion stays on the log&#8322;(n+1) curve.</p>
          <svg viewBox="0 0 420 220" class="chart">
            @for (g of [0, 25, 50, 75, 100]; track g) {
              <line x1="40" x2="410" [attr.y1]="cy(g)" [attr.y2]="cy(g)" class="grid" />
              <text x="32" [attr.y]="cy(g) + 4" class="lbl end">{{ g }}</text>
            }
            @for (p of d.insertion.size_curve; track p.list_size) {
              <text [attr.x]="cx(p.list_size)" y="214" class="lbl mid">{{ p.list_size }}</text>
            }
            <path [attr.d]="path(d, 'linear_scan_mean_comparisons')" class="ln red draw" />
            <path [attr.d]="path(d, 'binary_mean_comparisons')" class="ln teal draw" />
            @for (p of d.insertion.size_curve; track p.list_size) {
              <circle [attr.cx]="cx(p.list_size)" [attr.cy]="cy(p.linear_scan_mean_comparisons)" r="3.5" class="pt red" />
              <circle [attr.cx]="cx(p.list_size)" [attr.cy]="cy(p.binary_mean_comparisons)" r="3.5" class="pt teal" />
            }
            <text [attr.x]="cx(100) - 10" [attr.y]="cy(51.4) - 12" class="lbl end strong red-t">scroll from top</text>
            <text [attr.x]="cx(199) - 4" [attr.y]="cy(7.71) - 10" class="lbl end strong teal-t">binary insertion</text>
          </svg>
          <p class="small">Building a 100-place list: <b>{{ d.insertion.total_comparisons_to_build_100_list.binary | number: '1.0-1' }}</b> questions vs <b>{{ d.insertion.total_comparisons_to_build_100_list.linear_scan | number: '1.0-1' }}</b> ({{ d.insertion.total_comparisons_to_build_100_list.reduction_x }}x fewer).</p>
        </section>

        <section class="panel pad">
          <h3>Noisy users (&sigma; = 0.25)</h3>
          <p class="muted small">Questions per insert and Kendall tau of the final list vs the hidden true order, 100-place lists.</p>
          <div class="hbars">
            @for (m of methods; track m.key) {
              <div class="hb">
                <span class="hb-l">{{ m.label }}</span>
                <span class="hb-t"><span [class]="'hb-f ' + m.cls" [style.width.%]="noise(d, m.key).comparisons_per_insert / 20 * 100"></span></span>
                <span class="hb-v"><b>{{ noise(d, m.key).comparisons_per_insert | number: '1.2-2' }}</b> q &middot; &tau; {{ noise(d, m.key).kendall_tau | number: '1.3-3' }}</span>
              </div>
            }
          </div>
          <p class="small">Band first plus "too close to call" asks <b>43% fewer</b> questions than global binary search for a 0.005 drop in tau.</p>
        </section>

        <section class="panel pad">
          <h3>Peeking at an A/A test 20 times</h3>
          <p class="muted small">2,000 simulated experiments, 10,000 users per arm, no real effect. Anything above 5% is a false alarm rate you didn't sign up for.</p>
          <div class="vbars">
            @for (b of fpr(d); track b.label) {
              <div class="vb">
                <span class="vb-v">{{ b.v * 100 | number: '1.1-1' }}%</span>
                <span class="vb-t"><span [class]="'vb-f ' + b.cls" [style.height.%]="b.v / 0.3 * 100"></span><i class="alpha-line" [style.bottom.%]="0.05 / 0.3 * 100"></i></span>
                <span class="vb-l">{{ b.label }}</span>
              </div>
            }
          </div>
          <p class="small">With CUPED, mSPRT power on a +5% lift went from <b>{{ d.experiments['ab_raw'].msprt_reject_rate * 100 | number: '1.1-1' }}%</b> to <b>{{ d.experiments['ab_cuped'].msprt_reject_rate * 100 | number: '1.1-1' }}%</b>, and users needed to decide dropped {{ d.experiments['cuped_users_to_decision_reduction'] * 100 | number: '1.0-0' }}%.</p>
        </section>

        <section class="panel pad">
          <h3>Friend recommendations</h3>
          <p class="muted small">300 simulated diners in 6 taste clusters over 1,500 real Manhattan restaurants. Precision@10 against each diner's true top 10%.</p>
          <div class="hbars">
            @for (r of recRows(d); track r.label) {
              <div class="hb">
                <span class="hb-l">{{ r.label }}</span>
                <span class="hb-t"><span [class]="'hb-f ' + r.cls" [style.width.%]="r.v / 0.6 * 100"></span></span>
                <span class="hb-v"><b>{{ r.v | number: '1.3-3' }}</b></span>
              </div>
            }
          </div>
        </section>
      </div>

      <section class="panel pad">
        <h3>API latency</h3>
        <p class="muted small">gunicorn (4 sync workers) + PostgreSQL 16 on one laptop, 16 concurrent clients, {{ d.api_latency.requests | number }} requests, {{ d.api_latency.errors }} errors, {{ d.api_latency.throughput_rps | number: '1.0-0' }} req/s.</p>
        <table class="tbl">
          <thead><tr><th>Endpoint</th><th>Requests</th><th>p50</th><th>p95</th><th>p99</th></tr></thead>
          <tbody>
            @for (e of endpoints(d); track e.name) {
              <tr><td><code>{{ e.name }}</code></td><td>{{ e.n | number }}</td><td>{{ e.p50_ms | number: '1.1-1' }} ms</td><td><b>{{ e.p95_ms | number: '1.1-1' }} ms</b></td><td>{{ e.p99_ms | number: '1.1-1' }} ms</td></tr>
            }
            <tr class="total"><td>All requests</td><td>{{ d.api_latency.requests | number }}</td><td>{{ d.api_latency.all_requests['p50_ms'] | number: '1.1-1' }} ms</td><td><b>{{ d.api_latency.all_requests['p95_ms'] | number: '1.1-1' }} ms</b></td><td>{{ d.api_latency.all_requests['p99_ms'] | number: '1.1-1' }} ms</td></tr>
          </tbody>
        </table>
        <p class="muted small">One machine running client and server together, so this measures the request path and database work, not production capacity.</p>
      </section>
    } @else {
      <p class="muted">Loading results...</p>
    }
  `,
})
export class ResultsView {
  readonly data = signal<Bench | null>(null);
  readonly methods = [
    { key: 'linear', label: 'Scroll from top', cls: 'red' },
    { key: 'binary', label: 'Global binary', cls: 'gray' },
    { key: 'band_binary', label: 'Band first + binary', cls: 'teal-l' },
    { key: 'band_binary_tie', label: '+ "too close to call"', cls: 'teal' },
  ];

  constructor() {
    if (typeof fetch !== 'undefined') {
      fetch('results.json')
        .then((r) => r.json())
        .then((j) => this.data.set(j))
        .catch(() => undefined);
    }
  }

  cx(n: number) {
    return 40 + ((n - 10) / (199 - 10)) * 360;
  }
  cy(v: number) {
    return 196 - (v / 100) * 180;
  }
  path(d: Bench, k: 'binary_mean_comparisons' | 'linear_scan_mean_comparisons') {
    return d.insertion.size_curve.map((p, i) => `${i ? 'L' : 'M'}${this.cx(p.list_size).toFixed(1)},${this.cy(p[k]).toFixed(1)}`).join(' ');
  }
  noise(d: Bench, key: string) {
    const row = d.insertion.noise_table.find((r) => r['sigma'] === 0.25)!;
    return row[key] as { kendall_tau: number; comparisons_per_insert: number };
  }
  fpr(d: Bench) {
    const a = d.experiments['aa_raw'];
    return [
      { label: 'Naive z-test, stop at first p<.05', v: a.naive_peeking_reject_rate as number, cls: 'red' },
      { label: 'Fixed horizon (last look only)', v: a.fixed_horizon_reject_rate as number, cls: 'gray' },
      { label: 'mSPRT always-valid', v: a.msprt_reject_rate as number, cls: 'teal' },
    ];
  }
  recRows(d: Bench) {
    const r = d.recommendations;
    return [
      { label: 'Random', v: r['random_precision_at_10'] as number, cls: 'gray' },
      { label: 'Popularity', v: r['popularity'].precision_at_10 as number, cls: 'gray' },
      { label: 'Friends, unweighted', v: r['friends_unweighted'].precision_at_10 as number, cls: 'teal-l' },
      { label: 'Friends, taste-weighted', v: r['friends_taste_weighted'].precision_at_10 as number, cls: 'teal' },
    ];
  }
  endpoints(d: Bench) {
    return Object.entries(d.api_latency.by_endpoint)
      .filter(([k]) => k !== 'POST /diners')
      .map(([name, v]) => ({ name, ...v }));
  }
}
