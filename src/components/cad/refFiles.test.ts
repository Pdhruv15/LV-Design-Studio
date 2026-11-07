// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '../../data/sampleProject';
import { dropRefGeometry, printedRefs, refGeometry, type CadRef } from '../../model/cadRefs';
import { rememberPath } from './cadState';
import { readSheetRefs } from './refFiles';
import type { Project } from '../../types';

const bytes = (rel: string) => new Uint8Array(readFileSync(path.resolve(__dirname, '../../..', rel)));
const ref = (over: Partial<CadRef> = {}): CadRef => ({ name: 'STR-GF', file: 'STR-GF.dxf', type: 'overlay', at: [0, 0], scale: 1, rot: 0, fade: 50, print: true, ...over });
const project = (refs: CadRef[]): Project => ({ ...sampleProject, id: 'p1', cadPlans: [{ building: 'V', level: 'GF', file: 'GF.dwg', units: 4 }], cadRefs: { 'gf.dwg': refs } });
const readBytes = vi.fn(async (p: string) => (p === '/jobs/STR-GF.dxf' ? { file: 'STR-GF.dxf', path: p, bytes: bytes('electron/samples/sample-villa-ff.dxf') } : null));

beforeEach(() => {
  localStorage.clear();
  readBytes.mockClear();
  (window as { lvds?: unknown }).lvds = { cadFile: { engine: async () => bytes('electron/cad/lvds_cad_reader_bg.wasm'), readBytes, stat: async () => ({ mtimeMs: 1, size: 1 }) } };
});
afterEach(() => { for (const f of ['STR-GF.dxf', 'MECH.dxf', 'FIRE.dxf']) dropRefGeometry(f); delete (window as { lvds?: unknown }).lvds; });

describe('plan sheets read their references from disk', () => {
  it('reads a printed reference not read yet from where it was found, so the sheet prints it', async () => {
    rememberPath('p1', 'STR-GF.dxf', '/jobs/STR-GF.dxf');
    const p = project([ref(), ref({ name: 'MECH', file: 'MECH.dxf', print: false }), ref({ name: 'FIRE', file: 'FIRE.dxf', unloaded: true })]);
    expect(printedRefs(p, 'GF.dwg', 0.001)).toEqual([{ ref: ref(), missing: true }]);
    expect(await readSheetRefs(p, 'V', 'GF')).toEqual(['STR-GF.dxf']);
    expect(readBytes).toHaveBeenCalledTimes(1); // not the one that does not print, nor the unloaded one
    const [one] = printedRefs(p, 'GF.dwg', 0.001);
    expect(one.missing).toBeUndefined();
    expect(one.segs!.length).toBeGreaterThan(100);
    // Read once: the next sheet uses it as it is.
    expect(await readSheetRefs(p, 'V', 'GF')).toEqual([]);
    expect(readBytes).toHaveBeenCalledTimes(1);
  });

  it('leaves one it cannot read (not found, web version, no plan) to the sheet notes', async () => {
    rememberPath('p1', 'STR-GF.dxf', '/gone/STR-GF.dxf');
    const p = project([ref()]);
    expect(await readSheetRefs(p, 'V', 'GF')).toEqual([]);
    expect(refGeometry('STR-GF.dxf')).toBeUndefined();
    expect(printedRefs(p, 'GF.dwg', 0.001)).toEqual([{ ref: ref(), missing: true }]);
    delete (window as { lvds?: unknown }).lvds;
    expect(await readSheetRefs(p, 'V', 'GF')).toEqual([]);
    expect(await readSheetRefs(p, 'V', 'FF')).toEqual([]);
    expect(await readSheetRefs(p, undefined, undefined)).toEqual([]);
  });
});
