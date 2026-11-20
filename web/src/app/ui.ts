import { Component, computed, effect, input, signal, untracked } from '@angular/core';
import { cuisineLabel, emoji, hood, hue } from './core/meta';
import { Place } from './core/store';

/** Animated number that eases from its previous value to `to`. */
@Component({
  selector: 'app-count',
  template: `{{ text() }}`,
  host: { class: 'num' },
})
export class CountUp {
  readonly to = input.required<number>();
  readonly decimals = input(0);
  readonly duration = input(900);
  private readonly val = signal(0);
  readonly text = computed(() =>
    this.val().toLocaleString('en-US', { minimumFractionDigits: this.decimals(), maximumFractionDigits: this.decimals() }),
  );

  constructor() {
    effect((onCleanup) => {
      const target = this.to();
      const dur = this.duration();
      const from = untracked(this.val);
      if (typeof requestAnimationFrame === 'undefined' || typeof performance === 'undefined' || dur <= 0) {
        this.val.set(target);
        return;
      }
      const t0 = performance.now();
      let raf = 0;
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        this.val.set(from + (target - from) * e);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      onCleanup(() => cancelAnimationFrame(raf));
    });
  }
}

/** Cuisine tile: emoji on a soft color derived from the cuisine name. */
@Component({
  selector: 'app-tile',
  template: `<span aria-hidden="true">{{ glyph() }}</span>`,
  host: {
    class: 'tile',
    '[class.lg]': 'size() === "lg"',
    '[style.background]': 'bg()',
  },
})
export class Tile {
  readonly cuisine = input.required<string>();
  readonly size = input<'md' | 'lg'>('md');
  readonly glyph = computed(() => emoji(this.cuisine()));
  readonly bg = computed(() => {
    const h = hue(this.cuisine());
    return `linear-gradient(135deg, hsl(${h} 85% 93%), hsl(${(h + 40) % 360} 80% 86%))`;
  });
}

/** "Cuisine · Neighborhood" line. */
@Component({
  selector: 'app-meta',
  template: `{{ label() }}<span class="dot">·</span>{{ where() }}`,
  host: { class: 'meta' },
})
export class Meta {
  readonly place = input.required<Place>();
  readonly label = computed(() => cuisineLabel(this.place().cuisine));
  readonly where = computed(() => hood(this.place().zipcode));
}
