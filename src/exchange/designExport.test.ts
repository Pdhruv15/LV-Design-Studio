// @vitest-environment node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sampleProject } from '../data/sampleProject';
import { migrateProject } from '../model/projectMigrate';
import { renamePanels } from '../model/renamePanels';
import type { Project } from '../types';
import { designPackage } from './designContract';
import { designExport, designHashedText } from './designExport';

/** contracts/design.schema.json is made from designContract.ts. After changing the contract, run
 *   UPDATE_CONTRACTS=1 npx vitest run src/exchange/designExport.test.ts
 * and commit the file with the change (a new version for anything that is not backwards compatible). */
const sha256 = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const project = (): Project => migrateProject({ ...sampleProject, id: 'p-1' }, 'sample.json');
const exportOf = (p: Project, at = '2026-11-08T00:00:00.000Z') => designExport(p, { exportedAt: at, sha256, appVersion: 'test' });

describe('lvds.design version 1', () => {
  it('contracts/design.schema.json matches designContract.ts', () => {
    const text = `${JSON.stringify({ $id: 'https://lv-design-studio/contracts/design.schema.json', ...z.toJSONSchema(designPackage, { io: 'input' }) }, null, 2)}\n`;
    const file = path.resolve(__dirname, '../../contracts/design.schema.json');
    if (process.env.UPDATE_CONTRACTS) fs.writeFileSync(file, text);
    expect(fs.readFileSync(file, 'utf-8')).toBe(text);
  });

  it('exports every board and circuit with its uid, results and a valid hash', () => {
    const p = project();
    const pkg = exportOf(p);
    expect(designPackage.safeParse(pkg).success).toBe(true);
    expect(pkg.boards.map((b) => b.uid)).toEqual(p.boards.map((b) => b.uid));
    expect(pkg.circuits).toHaveLength(p.feeders.length);
    expect(new Set(pkg.circuits.map((c) => c.uid)).size).toBe(pkg.circuits.length);
    const uids = new Set(pkg.boards.map((b) => b.uid));
    for (const c of pkg.circuits) {
      expect(uids.has(c.boardUid)).toBe(true);
      if (c.feedsBoardUid) expect(uids.has(c.feedsBoardUid)).toBe(true);
      expect(c.results.designCurrentA).toBeGreaterThanOrEqual(0);
    }
    expect(pkg.sha256).toBe(sha256(designHashedText(pkg)));
  });

  it('the same project gives the same package apart from exportedAt', () => {
    const a = exportOf(project()), b = exportOf(project(), '2026-12-01T10:00:00.000Z');
    expect({ ...a, exportedAt: '' }).toEqual({ ...b, exportedAt: '' });
    expect(a.sha256).toBe(b.sha256);
  });

  it('after a rename the uids stay and the tags change; changed inputs change the fingerprint', () => {
    const p = project();
    const board = p.boards.find((x) => p.feeders.some((f) => f.boardId === x.id && f.id.startsWith(`${x.id}-`)))!;
    const before = exportOf(p);
    const after = exportOf(renamePanels(p, [{ from: board.id, to: 'DB-RENAMED' }]));
    const b0 = before.boards.find((x) => x.tag === board.id)!, b1 = after.boards.find((x) => x.uid === b0.uid)!;
    expect(b1.tag).toBe('DB-RENAMED');
    expect(after.circuits.filter((c) => c.boardUid === b0.uid).map((c) => c.uid).sort()).toEqual(before.circuits.filter((c) => c.boardUid === b0.uid).map((c) => c.uid).sort());
    const longer = exportOf({ ...p, feeders: p.feeders.map((f, i) => (i === 0 ? { ...f, lengthM: f.lengthM + 10 } : f)) });
    expect(longer.calculation.fingerprint).not.toBe(before.calculation.fingerprint);
  });
});
