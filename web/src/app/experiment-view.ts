import { Component, computed, signal } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { analyze, Report } from './core/stats';
import { simulateExperiment } from './core/simulate';

@Component({
  selector: 'app-experiment-view',
  imports: [DecimalPipe, PercentPipe],
  template: `
    <section>
      <h2>Peeking vs always-valid p-values</h2>
      <p class="muted">Simulated test: 3,000 diners per arm, metric = places ranked in two weeks, 20 dashboard refreshes.</p>
      <div class="controls">
        <button (click)="run(0)">Run an A/A test (no real effect)</button>
        <button (click)="run(0.08)">Run an A/B test (+8% true lift)</button>
        <label><input type="checkbox" [checked]="cuped()" (change)="cuped.set(!cuped())" /> CUPED</label>
      </div>
      @if (report(); as r) {
        <svg viewBox="0 0 400 180" class="chart" role="img" aria-label="p-values by look">
          <line x1="30" x2="390" [attr.y1]="y(0.05)" [attr.y2]="y(0.05)" class="alpha" />
          <text x="392" [attr.y]="y(0.05) + 4" class="lbl">.05</text>
          <polyline [attr.points]="line('pNaive')" class="naive" />
          <polyline [attr.points]="line('pAlwaysValid')" class="seq" />
        </svg>
        <p class="legend"><span class="naive">naive z-test at each look</span> <span class="seq">mSPRT always-valid</span></p>
        <ul class="facts">
          <li>Naive test crossed .05 at some look: <b>{{ naiveCrossed() ? 'yes' : 'no' }}</b></li>
          <li>Always-valid p at the end: <b>{{ r.pAlwaysValid | number: '1.3-3' }}</b>, decision: <b>{{ r.decision }}</b></li>
          @if (r.varianceReduction !== null) {
            <li>CUPED variance reduction: <b>{{ r.varianceReduction | percent: '1.0-0' }}</b></li>
          }
        </ul>
      }
    </section>
  `,
})
export class ExperimentView {
  readonly cuped = signal(true);
  readonly report = signal<Report | null>(null);
  private seed = 1;
  readonly naiveCrossed = computed(() => !!this.report()?.looks.some((l) => l.pNaive < 0.05));

  run(lift: number) {
    const d = simulateExperiment(this.seed++, 3000, lift);
    this.report.set(this.cuped() ? analyze(d.c, d.t, d.cPre, d.tPre, 0.05, 20) : analyze(d.c, d.t, undefined, undefined, 0.05, 20));
  }

  y(p: number): number {
    // log scale from p=1 (top) to p=1e-4 (bottom)
    const v = Math.max(Math.log10(Math.max(p, 1e-4)), -4);
    return 10 + (-v / 4) * 160;
  }

  line(key: 'pNaive' | 'pAlwaysValid'): string {
    const looks = this.report()?.looks ?? [];
    return looks.map((l, i) => `${30 + (i * 360) / Math.max(1, looks.length - 1)},${this.y(l[key])}`).join(' ');
  }
}
