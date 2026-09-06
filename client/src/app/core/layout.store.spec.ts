import { TestBed } from '@angular/core/testing';
import { LayoutStore } from './layout.store';

const KEY = 'perudo:boardLayout';

describe('LayoutStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('defaults to the Default layout with nothing stored', () => {
    const store = TestBed.inject(LayoutStore);
    expect(store.activeLayout()).toBe('default');
    expect(store.nextLayoutLabel()).toBe('Clockwise');
  });

  it('restores a validly stored layout on init', () => {
    localStorage.setItem(KEY, 'linear');
    const store = TestBed.inject(LayoutStore);
    expect(store.activeLayout()).toBe('linear');
  });

  it('falls back to default for a malformed stored value', () => {
    localStorage.setItem(KEY, 'not-a-real-layout');
    const store = TestBed.inject(LayoutStore);
    expect(store.activeLayout()).toBe('default');
  });

  it('cycles default -> clockwise -> linear -> default, with no dropdown/arbitrary setter', () => {
    const store = TestBed.inject(LayoutStore);
    expect(store.activeLayout()).toBe('default');

    store.cycleLayout();
    expect(store.activeLayout()).toBe('clockwise');
    expect(store.nextLayoutLabel()).toBe('Linear');

    store.cycleLayout();
    expect(store.activeLayout()).toBe('linear');
    expect(store.nextLayoutLabel()).toBe('Default');

    store.cycleLayout();
    expect(store.activeLayout()).toBe('default');
  });

  it('persists the cycled layout to localStorage', () => {
    const store = TestBed.inject(LayoutStore);
    store.cycleLayout();
    expect(localStorage.getItem(KEY)).toBe('clockwise');
  });
});
