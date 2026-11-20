import { Component, inject, OnInit } from '@angular/core';
import { Store, Tab } from './core/store';
import { RankFlow } from './rank-flow';
import { AlgoPanel } from './algo-panel';
import { ExperimentView } from './experiment-view';
import { FriendsView, ListView, ResultsView } from './views';
import { CountUp } from './ui';

@Component({
  selector: 'app-root',
  imports: [RankFlow, AlgoPanel, ExperimentView, ListView, FriendsView, ResultsView, CountUp],
  templateUrl: './app.html',
})
export class App implements OnInit {
  readonly store = inject(Store);
  readonly tab = this.store.tab;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'rank', label: 'Rank' },
    { id: 'list', label: 'My list' },
    { id: 'friends', label: "Friends' picks" },
    { id: 'experiments', label: 'Experiments' },
    { id: 'results', label: 'Results' },
  ];

  async ngOnInit() {
    await this.store.init();
  }
}
