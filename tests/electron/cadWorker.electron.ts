import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The worker can only be proved in a real Chromium: tests in jsdom have no workers, and a page loaded from a file under
 * the app's security policy is where one could fail to start. The app would then fall back to running the engine in the
 * page, which still works, so nothing else would show that the worker never ran. */

const electron = createRequire(import.meta.url)('electron') as unknown as string;
const LINES = Number(process.env.CAD_CHECK_LINES ?? 100_000);
let outDir: string;

function checks(inPage: boolean) {
  const out = path.join(outDir, `result-${inPage}.json`);
  const r = spawnSync(electron, [
    path.resolve('tests/electron/cadWorker.cjs'), path.join(outDir, 'tests/electron/page/index.html'), path.resolve('electron/cad/lvds_cad_reader_bg.wasm'),
    path.resolve('electron/samples/sample-villa-gf.dxf'), out, String(LINES), inPage ? '1' : '0'
  ], { encoding: 'utf-8', timeout: 150_000 });
  if (r.status !== 0) throw new Error(`Electron failed (${r.status}): ${r.error ?? ''}\n${r.stderr}`);
  return JSON.parse(readFileSync(out, 'utf-8'));
}

/** With CAD_CHECK_LINES set (a measurement), the figures for that size. */
function report(where: string, r: { ticks: number; longest: number; snapMs: number; openMb: number; closedMb: number }) {
  if (!process.env.CAD_CHECK_LINES) return;
  process.stdout.write(`${where} ${JSON.stringify({ lines: LINES, ticks: r.ticks, longestStallMs: Math.round(r.longest), snapMs: Number(r.snapMs.toFixed(1)), openMb: Math.round(r.openMb), closedMb: Math.round(r.closedMb) })}\n`);
}

beforeAll(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'lvds-cad-worker-'));
  // The app's own Vite config, so the worker is bundled and the security policy written as in the real build.
  await build({ logLevel: 'error', build: { outDir, emptyOutDir: false, rollupOptions: { input: path.resolve('tests/electron/page/index.html') } } });
});
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('the CAD engine in a real Electron window', () => {
  it('runs in its worker: opens, snaps, picks, closes and saves, and the page stays live', () => {
    const r = checks(false);
    expect(r.engine).toBe('worker');
    expect(r.format).toBe('DXF');
    expect(r.snapped).toEqual([100, 100, 1]);
    expect(r.picked).toBe('L1');
    expect(r.afterClose).toEqual([]);
    expect(r.dwg).toBe('AC1032');
    expect(r.largeEngine).toBe('worker');
    expect(r.segments).toBeGreaterThanOrEqual(LINES);
    expect(r.snapBig).toHaveLength(3);
    expect(r.ticks).toBeGreaterThan(2); // the page ran while the drawing was being read
    expect(r.openMb - r.closedMb).toBeGreaterThan(40); // closing gave the engine's memory back
    report('worker', r);
  });

  it('still works in the page when no worker can start', () => {
    const r = checks(true);
    expect(r.engine).toBe('page');
    expect(r.snapped).toEqual([100, 100, 1]);
    expect(r.picked).toBe('L1');
    expect(r.dwg).toBe('AC1032');
    report('page', r);
  });
});
