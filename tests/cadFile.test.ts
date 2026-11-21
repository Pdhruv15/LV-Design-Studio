import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { readDrawingBytes } = require('../electron/cadFile.cjs') as { readDrawingBytes: (file: string, templates?: boolean) => Uint8Array };
const fixture = (name: string) => join(__dirname, 'fixtures', 'cad', name);

describe('desktop drawing files (electron/cadFile.cjs)', () => {
  it('refuses other files and empty files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lvds-cadfile-'));
    writeFileSync(join(dir, 'a.txt'), 'x');
    writeFileSync(join(dir, 'empty.dwg'), '');
    expect(() => readDrawingBytes(join(dir, 'a.txt'))).toThrow(/not a DWG or DXF/);
    expect(() => readDrawingBytes(join(dir, 'empty.dwg'))).toThrow(/empty/);
  });

  it('gives the bytes of a drawing template (DWT) only where templates are asked for', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lvds-cadfile-'));
    writeFileSync(join(dir, 'office.dwt'), 'AC1032');
    expect(readDrawingBytes(fixture('plan-2018.dwg')).length).toBeGreaterThan(1000);
    expect(() => readDrawingBytes(join(dir, 'office.dwt'))).toThrow(/office\.dwt is not a DWG or DXF file/);
    expect(new TextDecoder().decode(readDrawingBytes(join(dir, 'office.dwt'), true))).toBe('AC1032');
    expect(() => readDrawingBytes(join(dir, 'a.txt'), true)).toThrow(/not a DWG, DXF or DWT file/);
  });
});
