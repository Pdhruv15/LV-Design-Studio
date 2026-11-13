import { describe, expect, it } from 'vitest';
import { CAPTIONS, tabForView, viewForTab } from './Ribbon';

describe('ribbon — Sheets is a main tab', () => {
  it('the Sheets screen is on its own tab, not on Documents', () => {
    expect(tabForView('sheets')).toBe('sheets');
    expect(tabForView('sheets', 'reports')).toBe('sheets');
    expect(tabForView('cable-schedule')).toBe('reports');
  });

  it('choosing the tab opens the Sheets screen; leaving it goes to the other tab\'s screen', () => {
    expect(viewForTab('sheets', 'design')).toBe('sheets');
    expect(viewForTab('reports', 'sheets')).toBe('cable-schedule');
  });

  it('has no tool groups of its own: the Excel-style ribbon is on the page', () => {
    expect(CAPTIONS.sheets).toEqual([]);
  });
});
