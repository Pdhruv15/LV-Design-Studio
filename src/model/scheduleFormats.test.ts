// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { LIBRARY_KEYS } from '../database/librarySync';
import { sampleProject } from '../data/sampleProject';
import { FORMATS_KEY, formatNameError, formatVersion, loadFormats, projectFormat, projectFormatStale, PANEL_CATEGORIES, removeFormat, renameFormat, saveFormats, scheduleFormatFileText, scheduleFormatFromFileText, SCHEDULE_FORMAT_FILE, SCHEDULE_FORMAT_FILE_VERSION, withFormat, withImportedFormat, withProjectFormat, type ScheduleFormat } from './scheduleFormats';
import { newSheet, type Sheet } from './sheets';

const tpl = (): Sheet => ({ ...newSheet(), link: { category: 'db', cells: {}, firstRow: 5, rows: [], columns: { A: 'row.ref' } } });
const fmt = (id: string, name: string): ScheduleFormat => ({ id, name, category: 'db', sheet: tpl(), updatedAt: '2026-11-14', version: 1 });
beforeEach(() => localStorage.clear());

describe('schedule formats library', () => {
  it('is one of the synced libraries', () => {
    expect(FORMATS_KEY).toBe('lvds.scheduleFormats');
    expect(LIBRARY_KEYS).toContain(FORMATS_KEY);
  });
  it('loads what was saved, drops bad entries and survives broken JSON', () => {
    expect(loadFormats()).toEqual([]);
    saveFormats([fmt('a', 'Alpha')]);
    expect(loadFormats()).toEqual([fmt('a', 'Alpha')]);
    localStorage.setItem(FORMATS_KEY, JSON.stringify([fmt('a', 'Alpha'), { id: '', name: 'x', sheet: tpl() }, { id: 'b', sheet: tpl() }, { id: 'c', name: 'No link', sheet: newSheet() }, { id: 'd', name: 'No sheet' }, null, 5]));
    expect(loadFormats().map((f) => f.id)).toEqual(['a']);
    localStorage.setItem(FORMATS_KEY, '{not json');
    expect(loadFormats()).toEqual([]);
    localStorage.setItem(FORMATS_KEY, '{"a":1}');
    expect(loadFormats()).toEqual([]);
  });
  it('treats an older format with no version as v1', () => {
    const { version: _version, ...old } = fmt('a', 'Alpha');
    localStorage.setItem(FORMATS_KEY, JSON.stringify([old]));
    expect(loadFormats()[0].version).toBe(1);
    expect(formatVersion(old)).toBe(1);
  });
  it('gives a format its category: none means db, and the sheet\'s link wins when the two differ', () => {
    const md = (): Sheet => ({ ...tpl(), link: { ...tpl().link!, category: 'md' } });
    const { category: _c, ...bare } = fmt('n', 'None');
    localStorage.setItem(FORMATS_KEY, JSON.stringify([bare, { ...fmt('m', 'Panel'), category: 'db', sheet: md() }, { ...fmt('p', 'Panel 2'), category: 'md', sheet: md() }, { ...fmt('q', 'Odd'), category: 'md' }]));
    expect(loadFormats().map((f) => [f.id, f.category])).toEqual([['n', 'db'], ['m', 'md'], ['p', 'md'], ['q', 'db']]);
  });
  it('withFormat takes the category from the template\'s link, on a new format and on a replaced one', () => {
    const md: Sheet = { ...tpl(), link: { ...tpl().link!, category: 'md' } };
    const added = withFormat([], 'Office panel', md, new Date('2026-11-14T10:00:00Z'));
    expect(added.list[0].category).toBe('md');
    const same = withFormat(added.list, 'office PANEL', tpl());
    expect([same.updated, same.list[0].category]).toEqual([true, 'db']);
  });
  it('withFormat adds a new one, and replaces by name ignoring case', () => {
    const added = withFormat([], ' Office DB ', tpl(), new Date('2026-11-14T10:00:00Z'));
    expect(added.updated).toBe(false);
    expect(added.list).toHaveLength(1);
    expect(added.list[0]).toMatchObject({ name: 'Office DB', category: 'db', updatedAt: '2026-11-14', version: 1 });
    expect(added.list[0].id).toMatch(/^fmt-/);
    const again = withFormat(added.list, 'office db', { ...tpl(), name: 'newer' }, new Date('2026-12-01T10:00:00Z'));
    expect(again.updated).toBe(true);
    expect(again.list).toHaveLength(1);
    expect(again.list[0]).toMatchObject({ id: added.list[0].id, name: 'Office DB', updatedAt: '2026-12-01', version: 2 });
    expect(again.list[0].sheet.name).toBe('newer');
  });
  it('rename and remove give new lists', () => {
    const list = [fmt('a', 'Alpha'), fmt('b', 'Beta')];
    expect(renameFormat(list, 'b', ' Gamma ').map((f) => f.name)).toEqual(['Alpha', 'Gamma']);
    expect(list[1].name).toBe('Beta');
    expect(removeFormat(list, 'a').map((f) => f.id)).toEqual(['b']);
  });
  it('names: needed, 60 characters, not another format\'s', () => {
    const list = [fmt('a', 'Alpha')];
    expect(formatNameError('  ', list)).toBe('Give the format a name.');
    expect(formatNameError('x'.repeat(61), list)).toBe('Keep the name to 60 characters.');
    expect(formatNameError('x'.repeat(60), list)).toBeUndefined();
    expect(formatNameError(' ALPHA ', list)).toBe('Another format has this name.');
    expect(formatNameError('alpha', list, 'a')).toBeUndefined();
    expect(formatNameError('Beta', list)).toBeUndefined();
  });
});

describe('portable schedule-format file', () => {
  it('round-trips one versioned format without a board target or pending project data, and imports as output-only', () => {
    const base = fmt('a', 'Office DB'), linked: ScheduleFormat = {
      ...base,
      version: 3,
      sheet: { ...base.sheet, link: { ...base.sheet.link!, mode: 'linked', boardId: 'DB-GF1', rows: ['r1'], pending: { r1: { A: 'changed' } }, added: [{ A: 'new' }] } }
    };
    const text = scheduleFormatFileText(linked, new Date('2026-11-20T12:00:00Z'));
    const file = JSON.parse(text);
    expect(file).toMatchObject({ format: SCHEDULE_FORMAT_FILE, version: SCHEDULE_FORMAT_FILE_VERSION, exportedAt: '2026-11-20T12:00:00.000Z' });
    const back = scheduleFormatFromFileText(text);
    expect(back).toMatchObject({ id: 'a', name: 'Office DB', version: 3 });
    expect(back.sheet.link).toMatchObject({ mode: 'output', rows: [] });
    expect(back.sheet.link).not.toHaveProperty('boardId');
    expect(back.sheet.link).not.toHaveProperty('pending');
    expect(back.sheet.link).not.toHaveProperty('added');
  });

  it('rejects unrelated, broken, newer and structurally invalid files', () => {
    expect(() => scheduleFormatFromFileText('{no')).toThrow('not valid JSON');
    expect(() => scheduleFormatFromFileText(JSON.stringify({ format: 'other', version: 1 }))).toThrow('not an LV Design Studio schedule format');
    expect(() => scheduleFormatFromFileText(JSON.stringify({ format: SCHEDULE_FORMAT_FILE, version: 99, scheduleFormat: fmt('a', 'A') }))).toThrow('newer LV Design Studio');
    expect(() => scheduleFormatFromFileText(JSON.stringify({ format: SCHEDULE_FORMAT_FILE, version: 1, scheduleFormat: { ...fmt('a', 'A'), sheet: newSheet() } }))).toThrow('incomplete or damaged');
    expect(() => scheduleFormatFromFileText(JSON.stringify({ format: SCHEDULE_FORMAT_FILE, version: 1, scheduleFormat: { ...fmt('a', 'A'), sheet: { ...tpl(), link: { ...tpl().link!, firstRow: 9999 } } } }))).toThrow('incomplete or damaged');
  });

  it('updates the same stable ID, or imports a safe uniquely named copy', () => {
    const existing = [fmt('a', 'Office DB'), fmt('b', 'Shared DB')], incoming = { ...fmt('a', 'Shared DB'), version: 4 };
    const updated = withImportedFormat(existing, incoming);
    expect(updated.action).toBe('updated');
    expect(updated.list).toHaveLength(2);
    expect(updated.format).toMatchObject({ id: 'a', name: 'Shared DB (imported)', version: 4 });
    expect(updated.format.sheet.link!.mode).toBe('output');
    const copied = withImportedFormat(existing, incoming, true);
    expect(copied.action).toBe('copied');
    expect(copied.list).toHaveLength(3);
    expect(copied.format.id).not.toBe('a');
    expect(copied.format.name).toBe('Shared DB (imported)');
    const added = withImportedFormat(existing, fmt('c', 'New format'));
    expect(added.action).toBe('added');
    expect(added.format.name).toBe('New format');
  });
});

describe('the format a project uses', () => {
  const alpha = fmt('a', 'Alpha');
  it('withProjectFormat sets a copy, replaces it, and removes it without leaving an empty object', () => {
    expect(projectFormat(sampleProject)).toBeUndefined();
    const p = withProjectFormat(sampleProject, 'db', alpha, new Date('2026-11-14T10:00:00Z'));
    expect(projectFormat(p)).toEqual({ id: 'a', name: 'Alpha', version: 1, sheet: alpha.sheet, appliedAt: '2026-11-14' });
    expect(sampleProject.scheduleFormats).toBeUndefined();
    const q = withProjectFormat(p, 'db', fmt('b', 'Beta'), new Date('2026-12-01T10:00:00Z'));
    expect(projectFormat(q)).toMatchObject({ id: 'b', name: 'Beta', appliedAt: '2026-12-01' });
    const gone = withProjectFormat(q, 'db', undefined);
    expect(gone).not.toHaveProperty('scheduleFormats');
    expect(withProjectFormat(sampleProject, 'db', undefined)).toEqual(sampleProject);
  });
  it('is stale when My formats has the format with a different sheet, and not otherwise', () => {
    const p = withProjectFormat(sampleProject, 'db', alpha);
    expect(projectFormatStale(p, 'db', [alpha])).toBe(false);
    expect(projectFormatStale(p, 'db', [{ ...alpha, sheet: { ...alpha.sheet, name: 'changed' } }])).toBe(true);
    expect(projectFormatStale(p, 'db', [fmt('other', 'Alpha')])).toBe(false);
    expect(projectFormatStale(p, 'db', [])).toBe(false);
    expect(projectFormatStale(sampleProject, 'db', [alpha])).toBe(false);
  });
  const panel = (id: string, name: string): ScheduleFormat => ({ ...fmt(id, name), category: 'md', sheet: { ...tpl(), link: { ...tpl().link!, category: 'md' } } });
  it('has four categories, each of the kind of its format', () => {
    expect(PANEL_CATEGORIES.map((c) => [c.key, c.label, c.plural, c.kind])).toEqual([['db', 'DB', 'DBs', 'db'], ['smdb', 'SMDB', 'SMDBs', 'md'], ['mdb', 'MDB', 'MDBs', 'md'], ['mcc', 'MCC', 'MCCs', 'md']]);
  });
  it('keeps a format for each category apart, and removes one without touching the others', () => {
    const a = fmt('a', 'Alpha'), m = panel('m', 'Office panel');
    let p = withProjectFormat(sampleProject, 'db', a, new Date('2026-11-14T10:00:00Z'));
    p = withProjectFormat(p, 'smdb', m, new Date('2026-11-14T10:00:00Z'));
    p = withProjectFormat(p, 'mcc', m);
    expect([projectFormat(p, 'db')?.name, projectFormat(p, 'smdb')?.name, projectFormat(p, 'mdb'), projectFormat(p, 'mcc')?.name]).toEqual(['Alpha', 'Office panel', undefined, 'Office panel']);
    const q = withProjectFormat(p, 'smdb', undefined);
    expect(Object.keys(q.scheduleFormats!)).toEqual(['db', 'mcc']);
    expect(Object.keys(withProjectFormat(withProjectFormat(q, 'db', undefined), 'mcc', undefined)).includes('scheduleFormats')).toBe(false);
    expect(projectFormatStale(p, 'smdb', [{ ...m, sheet: { ...m.sheet, name: 'changed' } }])).toBe(true);
    expect(projectFormatStale(p, 'db', [m])).toBe(false);
  });
  it('sets a format only for a category of its own kind', () => {
    const a = fmt('a', 'Alpha'), m = panel('m', 'Office panel');
    expect(withProjectFormat(sampleProject, 'smdb', a)).toBe(sampleProject);
    expect(withProjectFormat(sampleProject, 'mdb', a)).toBe(sampleProject);
    expect(withProjectFormat(sampleProject, 'db', m)).toBe(sampleProject);
  });
});
