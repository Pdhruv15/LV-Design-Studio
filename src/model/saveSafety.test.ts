import { describe, expect, it } from 'vitest';
import { newProject, type Project } from '../types';
import { issueRevision } from './revisions';
import { diffSections, projectFingerprint } from './saveSafety';

describe('project fingerprint', () => {
  it('is the same for the same content, different after a real change', () => {
    const a = newProject('A');
    expect(projectFingerprint(a)).toBe(projectFingerprint(JSON.parse(JSON.stringify(a))));
    expect(projectFingerprint({ ...a, name: 'B' })).not.toBe(projectFingerprint(a));
    expect(projectFingerprint({ ...a, boards: [...a.boards, { ...a.boards[0], id: 'X' }] })).not.toBe(projectFingerprint(a));
  });

  const issued = (): Project => {
    const a = issueRevision(issueRevision(newProject('A'), { description: 'First', date: '2026-01-01' }), { description: 'Second', date: '2026-01-02' });
    return { ...a, boqRevisions: [{ id: '0', date: '2026-01-03', description: 'Tender', lines: [] }] as unknown as Project['boqRevisions'] };
  };

  it('sees every change to the issued copies, by their content', () => {
    const a = issued(), fp = projectFingerprint(a), revs = a.revisions!;
    expect(projectFingerprint(JSON.parse(JSON.stringify(a)))).toBe(fp); // saved and opened again: new objects, same content
    expect(projectFingerprint({ ...a })).toBe(fp);
    expect(projectFingerprint({ ...a, revisions: [revs[0], { ...revs[1], description: 'Changed' }] })).not.toBe(fp);
    expect(projectFingerprint({ ...a, revisions: [revs[0], { ...revs[1], snapshot: { ...revs[1].snapshot, name: 'Changed' } }] })).not.toBe(fp);
    expect(projectFingerprint({ ...a, revisions: [revs[0]] })).not.toBe(fp);
    expect(projectFingerprint({ ...a, revisions: [revs[1], revs[0]] })).not.toBe(fp);
    expect(projectFingerprint({ ...a, boqRevisions: [{ ...a.boqRevisions![0], contract: true }] })).not.toBe(fp);
    expect(projectFingerprint(issueRevision(a, { description: 'Third', date: '2026-01-04' }))).not.toBe(fp);
  });

  it('tells no revisions from an empty list, as the saved file does', () => {
    const a = newProject('A');
    expect(projectFingerprint({ ...a, revisions: undefined })).toBe(projectFingerprint(a));
    expect(projectFingerprint({ ...a, revisions: [] })).not.toBe(projectFingerprint(a));
    expect(projectFingerprint({ ...a, boqRevisions: [] })).not.toBe(projectFingerprint(a));
  });

  it('comes back to the same value when an edit is undone', () => {
    const a = issued(), edited = { ...a, boards: [{ ...a.boards[0], ratedCurrentA: (a.boards[0].ratedCurrentA ?? 0) + 100 }] };
    expect(projectFingerprint(edited)).not.toBe(projectFingerprint(a));
    expect(projectFingerprint({ ...edited, boards: a.boards })).toBe(projectFingerprint(a));
  });

  it('reads each issued copy once, however many edits follow', () => {
    const a = issued();
    let reads = 0;
    const counted = (copy: object) => Object.defineProperty({ ...copy }, 'toJSON', { value() { reads++; return copy; } });
    const p = { ...a, revisions: a.revisions!.map(counted), boqRevisions: a.boqRevisions!.map(counted) } as Project;
    projectFingerprint(p);
    expect(reads).toBe(3);
    for (let i = 0; i < 5; i++) projectFingerprint({ ...p, name: `Edit ${i}` });
    expect(reads).toBe(3);
  });

  it('copes with a file whose revisions are not a list', () => {
    const a = newProject('A');
    const odd = (revisions: unknown) => projectFingerprint({ ...a, revisions } as unknown as Project);
    expect(odd('text')).not.toBe(odd(null));
    expect(odd(['text', null, 1])).toBe(odd(['text', null, 1]));
  });
});

describe('what differs between two versions', () => {
  const base = newProject('Villa');
  it('ignores who/when saved and reports nothing for identical projects', () => {
    expect(diffSections(base, { ...base, updatedAt: '2030-01-01', updatedBy: 'X' })).toEqual([]);
  });
  it('names the sections that changed, with counts for lists', () => {
    const theirs = { ...base, name: 'Villa 2', boards: [...base.boards, { ...base.boards[0], id: 'SMDB-1' }], status: 'review' as const };
    const d = Object.fromEntries(diffSections(base, theirs).map((c) => [c.key, c]));
    expect(d.name.label).toBe('Project name');
    expect(d.boards).toMatchObject({ label: 'Panels', detail: '1 → 2, 1 only in the other' });
    expect(d.status.detail).toBe('only in the other');
    const edited = diffSections(base, { ...base, boards: [{ ...base.boards[0], ratedCurrentA: 2000 }] });
    expect(edited[0].detail).toBe('1 → 1, 1 edited');
  });
});
