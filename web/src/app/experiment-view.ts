import { Component, computed, OnDestroy, signal } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { analyze, Report } from './core/stats';
import { simulateExperiment } from './core/simulate';

interface Mc { done: number; total: number; naive: number; fixed: number; seq: number; lift: number }

@Component({
  selector: 'app-experiment-view',
  imports: [DecimalPipe, PercentPipe],
  template: `
    <div class="grid2 exp">
      <section class="panel pad">
        <h2>Peeking vs always-valid p-values</h2>
        <p class="muted">One simulated test: 3,000 diners per arm, metric = places ranked in two weeks, the dashboard refreshed 20 times. Run an A/A test a few times and watch the naive line dip under .05 with no real effect.</p>
        <div class="controls">
          <button class="btn primary sm" (click)="run(0)">Run an A/A test (no real effect)</button>
          <button class="btn sm" (click)="run(0.08)">Run an A/B test (+8% true lift)</button>
          <label class="toggle"><input type="checkbox" [checked]="cuped()" (change)="cuped.set(!cuped())" /><span class="sw"></span> CUPED</label>
        </div>
        @if (report(); as r) {
          @for (k of [runId()]; track k) {
            <svg viewBox="0 0 420 210" class="chart" role="img" aria-label="p-values by look">
              @for (g of ticks; track g.p) {
                <line x1="40" x2="410" [attr.y1]="y(g.p)" [attr.y2]="y(g.p)" [class]="g.p === 0.05 ? 'alpha' : 'grid'" />
                <text x="34" [attr.y]="y(g.p) + 4" class="lbl end">{{ g.l }}</text>
              }
              @for (i of [1, 5, 10, 15, 20]; track i) {
                <text [attr.x]="x(i - 1, 20)" y="204" class="lbl mid">{{ i }}</text>
              }
              @if (y(0.05) > 0) {
                <rect x="40" [attr.y]="y(0.05)" width="370" [attr.height]="186 - y(0.05)" class="danger" />
              }
              <polyline [attr.points]="line('pNaive')" class="naive draw" />
              <polyline [attr.points]="line('pAlwaysValid')" class="seq draw" />
              @if (firstCross(); as c) {
                <circle [attr.cx]="x(c - 1, r.looks.length)" [attr.cy]="y(r.looks[c - 1].pNaive)" r="5" class="cross" />
                <text [attr.x]="x(c - 1, r.looks.length) + 8" [attr.y]="y(r.looks[c - 1].pNaive) + 4" class="lbl strong red-t">naive "ships" at look {{ c }}</text>
              }
            </svg>
          }
          <div class="legend"><span class="naive">naive z-test at each look</span><span class="seq">mSPRT always-valid</span><span class="muted">x: dashboard look, y: p-value (log)</span></div>
          <div class="facts">
            <div><span class="k">Naive crossed .05</span><b [class.red-t]="naiveCrossed()">{{ naiveCrossed() ? 'Yes, at look ' + firstCross() : 'No' }}</b></div>
            <div><span class="k">Always-valid p</span><b>{{ r.pAlwaysValid | number: '1.3-3' }}</b></div>
            <div><span class="k">Decision</span><b [class]="'dec ' + r.decision.replace(' ', '-')">{{ r.decision }}</b></div>
            @if (r.varianceReduction !== null) {
              <div><span class="k">CUPED variance cut</span><b>{{ r.varianceReduction | percent: '1.0-0' }}</b></div>
            }
          </div>
        } @else {
          <div class="placeholder">Run a test to draw the p-value paths.</div>
        }
      </section>

      <section class="panel pad mc">
        <h2>Now run 200 of them</h2>
        <p class="muted">Monte Carlo in your browser: 200 A/A tests (no real effect), 20 looks each. How often does each rule declare a winner?</p>
        <div class="controls">
          <button class="btn primary sm" [disabled]="running()" (click)="monteCarlo(0)">{{ running() ? 'Running...' : 'Run 200 A/A tests' }}</button>
          <button class="btn sm" [disabled]="running()" (click)="monteCarlo(0.08)">200 A/B tests (+8%)</button>
        </div>
        @if (mc(); as m) {
          <div class="progress"><span [style.width.%]="(m.done / m.total) * 100"></span></div>
          <p class="small muted">{{ m.done }} / {{ m.total }} {{ m.lift ? 'A/B' : 'A/A' }} tests{{ cuped() ? ', CUPED on' : '' }}</p>
          <div class="vbars">
            @for (b of bars(); track b.label) {
              <div class="vb">
                <span class="vb-v">{{ b.v * 100 | number: '1.1-1' }}%</span>
                <span class="vb-t">
                  <span [class]="'vb-f ' + b.cls" [style.height.%]="m.lift ? b.v * 100 : Math.min(100, (b.v / 0.3) * 100)"></span>
                  @if (!m.lift) {
                    <i class="alpha-line" [style.bottom.%]="(0.05 / 0.3) * 100"></i>
                  }
                </span>
                <span class="vb-l">{{ b.label }}</span>
              </div>
            }
          </div>
          <p class="small">
            @if (!m.lift) {
              Each bar is a <b>false-positive rate</b>; the dashed line is the 5% you meant to accept.
              The offline run (2,000 tests, 10,000 users per arm) gave 25.2% naive vs 2.0% mSPRT.
            } @else {
              Each bar is <b>power</b>: how often a real +8% lift was detected. mSPRT trades some power for staying honest under peeking; CUPED wins most of it back.
            }
          </p>
        } @else {
          <div class="placeholder">Takes about two seconds.</div>
        }
      </section>
    </div>
  `,
})
export class ExperimentView implements OnDestroy {
  readonly Math = Math;
  readonly cuped = signal(true);
  readonly report = signal<Report | null>(null);
  readonly runId = signal(0);
  readonly mc = signal<Mc | null>(null);
  readonly running = signal(false);
  private seed = 1;
  private mcSeed = 10_000;
  private cancelled = false;
  readonly ticks = [
    { p: 1, l: '1' },
    { p: 0.1, l: '.1' },
    { p: 0.05, l: '.05' },
    { p: 0.01, l: '.01' },
    { p: 0.001, l: '.001' },
    { p: 0.0001, l: '.0001' },
  ];
  readonly naiveCrossed = computed(() => !!this.report()?.looks.some((l) => l.pNaive < 0.05));
  readonly firstCross = computed(() => {
    const i = this.report()?.looks.findIndex((l) => l.pNaive < 0.05) ?? -1;
    return i < 0 ? null : i + 1;
  });
  readonly bars = computed(() => {
    const m = this.mc();
    if (!m || !m.done) return [];
    return [
      { label: 'Naive, stop at first p<.05', v: m.naive / m.done, cls: 'red' },
      { label: 'Fixed horizon', v: m.fixed / m.done, cls: 'gray' },
      { label: 'mSPRT always-valid', v: m.seq / m.done, cls: 'teal' },
    ];
  });

  private analyzeOne(seed: number, lift: number): Report {
    const d = simulateExperiment(seed, 3000, lift);
    return this.cuped() ? analyze(d.c, d.t, d.cPre, d.tPre, 0.05, 20) : analyze(d.c, d.t, undefined, undefined, 0.05, 20);
  }

  run(lift: number) {
    this.report.set(this.analyzeOne(this.seed++, lift));
    this.runId.update((v) => v + 1);
  }

  monteCarlo(lift: number, total = 200) {
    this.running.set(true);
    this.cancelled = false;
    const m: Mc = { done: 0, total, naive: 0, fixed: 0, seq: 0, lift };
    this.mc.set({ ...m });
    const chunk = () => {
      if (this.cancelled) return;
      const end = Math.min(total, m.done + 8);
      for (; m.done < end; m.done++) {
        const r = this.analyzeOne(this.mcSeed++, lift);
        if (r.looks.some((l) => l.pNaive < 0.05)) m.naive++;
        if (r.looks[r.looks.length - 1].pNaive < 0.05) m.fixed++;
        if (r.pAlwaysValid < 0.05) m.seq++;
      }
      this.mc.set({ ...m });
      if (m.done < total) setTimeout(chunk, 0);
      else this.running.set(false);
    };
    setTimeout(chunk, 0);
  }

  ngOnDestroy() {
    this.cancelled = true;
  }

  x(i: number, n: number): number {
    return 40 + (i * 370) / Math.max(1, n - 1);
  }

  y(p: number): number {
    // log scale from p=1 (top) to p=1e-4 (bottom)
    const v = Math.max(Math.log10(Math.max(p, 1e-4)), -4);
    return 10 + (-v / 4) * 176;
  }

  line(key: 'pNaive' | 'pAlwaysValid'): string {
    const looks = this.report()?.looks ?? [];
    return looks.map((l, i) => `${this.x(i, looks.length).toFixed(1)},${this.y(l[key]).toFixed(1)}`).join(' ');
  }
}
