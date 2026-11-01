import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The web version is replaced on the server each time a build goes live, while a page may still be open. Only a real
 * Chromium shows what a service worker does then, so this builds a small page with the app's own Vite config, service
 * worker included, in several versions. Before this was handled, the first page opened afterwards took the whole app down. */

const electron = createRequire(import.meta.url)('electron') as unknown as string;
const root = path.resolve('tests/electron/webUpdate');
let work: string;
const built = new Map<string, string>();

async function buildOf(name: string) {
  const done = built.get(name);
  if (done) return done;
  const outDir = path.join(work, name);
  process.env.VITE_WEB_UPDATE_BUILD = name;
  await build({ root, configFile: path.resolve('vite.config.ts'), publicDir: path.resolve('public'), logLevel: 'error', envDir: work, build: { outDir, emptyOutDir: true } });
  built.set(name, outDir);
  return outDir;
}

/** The first build opened and left open while each of the others goes live, then its later page opened. */
async function liveWhileOpen(...names: string[]) {
  const builds = [];
  for (const name of names) builds.push(await buildOf(name));
  const out = path.join(work, 'result.json');
  rmSync(out, { force: true });
  const r = spawnSync(electron, [path.resolve('tests/electron/webUpdate.cjs'), out, ...builds], { encoding: 'utf-8', timeout: 120_000 });
  if (r.status !== 0 || r.error) throw new Error(`Electron failed (${r.status}): ${r.error ?? ''}\n${r.stderr}`);
  return JSON.parse(readFileSync(out, 'utf-8'));
}

beforeAll(() => { work = mkdtempSync(path.join(tmpdir(), 'lvds-web-update-')); });
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('new web builds going live while a page is open', () => {
  it('keeps a page not opened yet working, from the build the open page runs', async () => {
    const r = await liveWhileOpen('A', 'B');
    expect(r.after).toEqual({ alive: true, later: 'A', notLoaded: null, errors: [] });
    expect(r.kept).toBe(2);
  });

  it('still does after three newer builds', async () => {
    const r = await liveWhileOpen('A', 'B', 'C', 'D');
    expect(r.after).toEqual({ alive: true, later: 'A', notLoaded: null, errors: [] });
    expect(r.kept).toBe(4);
  });

  it('says so on that page after more, and the app stays up', async () => {
    const r = await liveWhileOpen('A', 'B', 'C', 'D', 'E');
    expect(r.kept).toBe(4); // the oldest has gone: the newest and the three before it
    expect(r.after.alive).toBe(true);
    expect(r.after.later).toBeNull();
    expect(r.after.notLoaded).toContain('This page could not be loaded');
    expect(r.after.errors).toEqual([]);
  });

  it('gives a page opened with no connection the newest build, not an older one it keeps', async () => {
    const r = await liveWhileOpen('A', 'B', 'C');
    expect(r.offline).toBe(r.newest);
  });
});
