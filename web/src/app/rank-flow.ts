import { Component, inject, signal } from '@angular/core';
import { Band } from './core/engine';
import { Place, Store } from './core/store';

@Component({
  selector: 'app-rank-flow',
  template: `
    @if (store.session(); as s) {
      @if (s.status === 'open' && s.compare_with) {
        <section class="h2h" aria-label="head to head">
          <p class="eyebrow">Question {{ s.comparisons + 1 }} of at most {{ s.max_comparisons }}</p>
          <h2>Which did you like more?</h2>
          <div class="cards">
            <button class="card new" (click)="store.answer('new')">
              <span class="name">{{ s.place.name }}</span><span class="cuisine">{{ s.place.cuisine }}</span>
            </button>
            <span class="vs">vs</span>
            <button class="card old" (click)="store.answer('existing')">
              <span class="name">{{ s.compare_with.name }}</span><span class="cuisine">{{ s.compare_with.cuisine }}</span>
            </button>
          </div>
          <button class="tie" (click)="store.answer('tie')">Too close to call</button>
        </section>
      } @else {
        <section class="done">
          <h2>Placed {{ s.place.name }}</h2>
          <p>{{ s.comparisons }} question{{ s.comparisons === 1 ? '' : 's' }} for a band of {{ s.band_size }}.</p>
          <button (click)="store.closeSession()">Rank another</button>
        </section>
      }
    } @else if (picked(); as p) {
      <section class="band">
        <h2>How was {{ p.name }}?</h2>
        <div class="bands">
          <button class="liked" (click)="go(p, 'liked')">I liked it</button>
          <button class="fine" (click)="go(p, 'fine')">It was fine</button>
          <button class="disliked" (click)="go(p, 'disliked')">I didn't like it</button>
        </div>
        <button class="link" (click)="picked.set(null)">Back</button>
      </section>
    } @else {
      <section>
        <input placeholder="Search a restaurant or cuisine" (input)="store.search($any($event.target).value)" />
        <ul class="results">
          @for (p of store.results(); track p.id) {
            <li><button (click)="picked.set(p)"><b>{{ p.name }}</b> <span>{{ p.cuisine }}</span></button></li>
          }
        </ul>
      </section>
    }
  `,
})
export class RankFlow {
  readonly store = inject(Store);
  readonly picked = signal<Place | null>(null);

  async go(p: Place, band: Band) {
    this.picked.set(null);
    await this.store.start(p, band);
  }
}
