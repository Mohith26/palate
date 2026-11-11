import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { Store } from './core/store';

const places = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `Spot ${i + 1}`, cuisine: 'Thai' }));

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('ranks a place through the head-to-head UI', async () => {
    const store = TestBed.inject(Store);
    await store.init(places);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const click = async (sel: string, idx = 0) => {
      (el.querySelectorAll(sel)[idx] as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    // first place goes straight in
    await click('.results button', 0);
    await click('.bands .liked');
    expect(store.count()).toBe(1);
    await click('.done button');
    // second place needs one head-to-head question
    await click('.results button', 0);
    await click('.bands .liked');
    expect(el.querySelector('.h2h h2')?.textContent).toContain('Which did you like more?');
    await click('.card.new');
    expect(store.count()).toBe(2);
    expect(store.entries()[0].place.id).toBe(2);
    expect(el.querySelector('.done')?.textContent).toContain('1 question');
  });

  it('renders the experiment chart', async () => {
    const store = TestBed.inject(Store);
    await store.init(places);
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.tab.set('experiments');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.controls button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.querySelectorAll('polyline').length).toBe(2);
  });
});
