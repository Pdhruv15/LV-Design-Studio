import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Only a real window shows whether a dead or stuck page can be replaced at all, and with a page that asks before closing
 * (as the app does with unsaved work). A page really stuck in a loop answers nothing, so nothing short of ending it works. */

const electron = createRequire(import.meta.url)('electron') as unknown as string;
const STOPPED = 'LV Design Studio stopped', HUNG = 'LV Design Studio is not responding';
let work: string;
let r: { crash: Page; busy: Page & { whileBusy: string[] }; hang: Page & { stuck: boolean }; nextCrash: Page; closed: { asked: string[] }; quits: number; blocked: number; logged: boolean; refused: boolean };
type Page = { asked: string[]; title: string; isNew: boolean };

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'lvds-window-watch-'));
  const out = path.join(work, 'result.json');
  const run = spawnSync(electron, [path.resolve('tests/electron/windowWatch.cjs'), out, path.join(work, 'logs')], { encoding: 'utf-8', timeout: 120_000 });
  if (run.status !== 0 || run.error) throw new Error(`Electron failed (${run.status}): ${run.error ?? ''}\n${run.stderr}`);
  r = JSON.parse(readFileSync(out, 'utf-8'));
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('the window watch on a real window', () => {
  it('after a crash asks, and Reload brings up a new page', () => {
    expect(r.crash).toEqual({ asked: [STOPPED], title: 'test page', isNew: true });
  });

  it('a page busy for a while: asks, then withdraws the question by itself and leaves the page alone', () => {
    expect(r.busy).toEqual({ whileBusy: [HUNG], asked: [HUNG], title: 'test page', isNew: false });
  });

  it('replaces a page really stuck in a loop, without asking about the crash that takes', () => {
    expect(r.hang).toEqual({ stuck: true, asked: [HUNG], title: 'test page', isNew: true });
  });

  it('still asks about the next real crash', () => {
    expect(r.nextCrash).toEqual({ asked: [STOPPED], title: 'test page', isNew: true });
  });

  it('a page asking before closing does not get in the way, and nothing quits', () => {
    expect(r.blocked).toBe(0);
    expect(r.quits).toBe(0);
  });

  it('asks nothing when the window is simply closed', () => {
    expect(r.closed.asked).toEqual([]);
  });

  it('a page writes to the log file through the app\'s bridge, and only text', () => {
    expect(r.logged).toBe(true);
    expect(r.refused).toBe(true);
    expect(readFileSync(path.join(work, 'logs/errors.log'), 'utf-8')).toContain('an entry from the page');
  });

  it('logs what happened, in order', () => {
    const log = readFileSync(path.join(work, 'logs/errors.log'), 'utf-8');
    const order = ['the page stopped', 'the window stopped responding', 'the window is responding again', 'reloading the window, as asked'].map((what) => log.indexOf(what));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(log.lastIndexOf('the page stopped')).toBeGreaterThan(order[3]);
    expect(log).toContain('LV Design Studio test (desktop window)');
  });
});
