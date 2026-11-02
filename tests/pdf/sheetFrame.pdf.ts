// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { sampleProject } from '../../src/data/sampleProject';
import { buildSldSheetHtml } from '../../src/docs/sldSheet';

/** The drawing sheet's frame, revision table, title block and legend column printed through the app's Chromium call and
 * measured on the page: every line meets the next, and none is drawn twice (a thin border beside the frame's heavy one). */

const electron = createRequire(import.meta.url)('electron') as unknown as string;
const dir = mkdtempSync(path.join(tmpdir(), 'lvds-sheet-frame-'));
afterAll(() => { if (!process.env.KEEP_PDF) rmSync(dir, { recursive: true, force: true }); });

const SCALE = 2, PX = (72 / 25.4) * SCALE; // pixels per mm
let png: PNG;
beforeAll(() => {
  const history = Array.from({ length: 4 }, (_, i) => ({ id: 'ABCD'[i], date: `2026-10-0${i + 1}`, description: `Issue ${i + 1}` }));
  const html = buildSldSheetHtml(sampleProject, '<svg viewBox="0 0 100 50"></svg>', 'A3', { no: 'E-SLD-001', title: 'SLD', count: 1, index: 1, history, legendSvg: '<svg viewBox="0 0 10 10"></svg>' });
  const input = path.join(dir, 'sheet.html'), pdf = path.join(dir, 'sheet.pdf'), out = path.join(dir, 'sheet');
  writeFileSync(input, html);
  for (const [script, args] of [['render.cjs', [input, pdf, path.join(dir, 'sheet.json'), '1587']], ['rasterize.cjs', [pdf, out, String(SCALE), '1']]] as const) {
    const r = spawnSync(electron, [path.resolve('tests/pdf', script), ...args], { encoding: 'utf-8', timeout: 120_000 });
    if (r.status !== 0) throw new Error(`${script} failed: ${r.stderr || r.error}`);
  }
  png = PNG.sync.read(readFileSync(path.join(out, 'p1.png')));
});

const at = (mm: number) => Math.round(mm * PX);
const dark = (x: number, y: number) => png.data[(y * png.width + x) * 4] < 200;
/** Runs of dark pixels along a column (or a row), as [first, last] pixel. */
function runs(fixed: number, from: number, to: number, column = true): [number, number][] {
  const out: [number, number][] = [];
  for (let i = from; i <= to; i++) {
    if (!(column ? dark(fixed, i) : dark(i, fixed))) continue;
    const last = out[out.length - 1];
    if (last && last[1] === i - 1) last[1] = i; else out.push([i, i]);
  }
  return out;
}
const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
const thick = (r: [number, number]) => r[1] - r[0] + 1;

// A3 landscape: the frame from 20 mm to 410 mm across, 10 mm to 287 mm down, 0.7 mm heavy; inside it the title block,
// 180 mm wide in the bottom right corner (columns at 60 mm), and the 92 mm legend column above it.
describe('printed drawing sheet: frame, revision table, title block, legend column', () => {
  const TB = 409.3 - 180, TB_X = 405, REV_X = 215, BODY_Y = 120;

  it('the revision table\'s top and row lines are the title block\'s, at the same height', () => {
    const block = runs(at(TB_X), at(BODY_Y), at(287) - 6), table = runs(at(REV_X), at(BODY_Y), at(287) - 6);
    expect(block).toHaveLength(6); // the band's top and the lines between its six rows
    expect(table.length).toBeGreaterThanOrEqual(6); // the same lines, then the generated-by line's text
    table.slice(0, 6).forEach((r, i) => expect(Math.abs(mid(r) - mid(block[i])), `line ${i}`).toBeLessThanOrEqual(1));
  });

  it('draws the frame\'s foot and right edge once: as heavy beside the title block as anywhere else', () => {
    const foot = (x: number) => runs(at(x), at(287) - 12, at(287) + 8).pop()!;
    expect(thick(foot(TB_X))).toBe(thick(foot(100)));
    const right = (y: number) => runs(y, at(409.3) - 12, at(410) + 8, false).pop()!;
    const block = runs(at(TB_X), at(BODY_Y), at(287) - 6);
    expect(thick(right(Math.round((block[1][1] + block[2][0]) / 2)))).toBe(thick(right(at(60))));
  });

  it('brings the legend column\'s edge down onto the band\'s top line', () => {
    const edge = runs(at(BODY_Y), at(409.3 - 92) - 8, at(409.3 - 92) + 8, false);
    expect(edge).toHaveLength(1);
    const x = Math.round(mid(edge[0])), top = runs(at(TB_X), at(BODY_Y), at(287))[0];
    const line = runs(x, at(BODY_Y), at(287)).find((r) => r[0] <= at(BODY_Y))!;
    expect(line[1]).toBeGreaterThanOrEqual(top[0]); // no gap between the column's edge and the band
  });

  it('draws each divider of the drawing number and revision rows as one line, in the same place', () => {
    const block = runs(at(TB_X), at(BODY_Y), at(287) - 6);
    const dividers = (y: number) => runs(y, at(TB + 60) - 10, at(TB + 60) + 10, false);
    const [rev, drawn] = [3, 4].map((i) => dividers(Math.round((block[i][1] + block[i + 1][0]) / 2)));
    expect(rev).toHaveLength(1);
    expect(drawn).toEqual(rev);
    expect(thick(rev[0])).toBeLessThanOrEqual(3);
    expect(runs(Math.round((block[3][1] + block[4][0]) / 2), at(TB) - 6, at(TB) + 6, false)).toHaveLength(1); // the block's left edge
  });
});
