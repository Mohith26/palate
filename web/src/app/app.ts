import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Store } from './core/store';
import { RankFlow } from './rank-flow';
import { ExperimentView } from './experiment-view';

type Tab = 'list' | 'rank' | 'friends' | 'experiments';

@Component({
  selector: 'app-root',
  imports: [RankFlow, ExperimentView, DecimalPipe],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit {
  readonly store = inject(Store);
  readonly tab = signal<Tab>('rank');

  async ngOnInit() {
    await this.store.init();
  }
}
