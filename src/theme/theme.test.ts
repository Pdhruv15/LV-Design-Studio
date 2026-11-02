// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyPalette, applyTheme, onScreenThemeChange, resolveTheme, screenAppearance, screenTheme, withPrintTheme } from './theme';
import { loadPrefs } from '../model/profile';

const html = () => document.documentElement;
afterEach(() => { applyTheme('dark'); applyPalette('graphite'); localStorage.clear(); });

describe('screen theme', () => {
  it('defaults to dark, written as no attribute', () => {
    applyTheme(undefined);
    expect(html().hasAttribute('data-theme')).toBe(false);
    expect(resolveTheme(undefined)).toBe('dark');
  });

  it('switches to light and back', () => {
    applyTheme('light');
    expect(html().getAttribute('data-theme')).toBe('light');
    applyTheme('dark');
    expect(html().hasAttribute('data-theme')).toBe(false);
  });

  it('switches the palette, graphite written as no attribute', () => {
    applyPalette('blueprint');
    expect(html().getAttribute('data-palette')).toBe('blueprint');
    expect(screenAppearance()).toBe('blueprint-dark');
    applyTheme('light');
    expect(screenAppearance()).toBe('blueprint-light');
    applyPalette(undefined);
    expect(html().hasAttribute('data-palette')).toBe(false);
    expect(screenAppearance()).toBe('graphite-light');
  });

  it('reads exports with the default Graphite dark palette and restores the screen theme', () => {
    applyTheme('light');
    applyPalette('blueprint');
    const seen = withPrintTheme(() => [html().getAttribute('data-theme'), html().getAttribute('data-palette')]);
    expect(seen).toEqual([null, null]);
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(html().getAttribute('data-palette')).toBe('blueprint');
  });

  it('restores the screen theme even when the export throws', () => {
    applyTheme('light');
    expect(() => withPrintTheme(() => { throw new Error('boom'); })).toThrow('boom');
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('reports a theme or palette change to canvas drawing, but not the export switch and back', async () => {
    const seen: string[] = [];
    const off = onScreenThemeChange((t) => seen.push(t));
    const flush = () => new Promise((r) => setTimeout(r, 0));
    applyTheme('light');
    await flush();
    expect(seen).toEqual(['light']);
    expect(screenTheme()).toBe('light');
    withPrintTheme(() => null);
    await flush();
    expect(seen).toEqual(['light']);
    applyPalette('blueprint');
    await flush();
    expect(seen).toEqual(['light', 'light']);
    applyTheme('dark');
    await flush();
    expect(seen).toEqual(['light', 'light', 'dark']);
    off();
    applyTheme('light');
    await flush();
    expect(seen).toEqual(['light', 'light', 'dark']);
  });

  it('ignores an unknown stored theme', () => {
    localStorage.setItem('lvds.preferences', JSON.stringify({ app: { autosaveMin: 5, theme: 'neon' } }));
    const p = loadPrefs();
    expect(p.app.theme).toBeUndefined();
    expect(p.app.autosaveMin).toBe(5);
  });

  it('keeps a valid stored theme', () => {
    localStorage.setItem('lvds.preferences', JSON.stringify({ app: { theme: 'light' } }));
    expect(loadPrefs().app.theme).toBe('light');
  });

  it('ignores an unknown stored palette', () => {
    localStorage.setItem('lvds.preferences', JSON.stringify({ app: { palette: 'neon' } }));
    expect(loadPrefs().app.palette).toBeUndefined();
  });

  it('keeps a valid stored palette', () => {
    localStorage.setItem('lvds.preferences', JSON.stringify({ app: { palette: 'blueprint' } }));
    expect(loadPrefs().app.palette).toBe('blueprint');
  });
});
