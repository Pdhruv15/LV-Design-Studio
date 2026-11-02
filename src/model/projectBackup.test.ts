import zlib from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildBackup, checkpointsFor, readBackup, readBackupFile } from './projectBackup';
import { autoCheckpoint, excess, MemoryStore, newCheckpoint, saveCheckpoint, type Checkpoint } from './checkpoints';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';

const project: Project = { ...sampleProject, id: 'p-1', schemaVersion: 1 };
const at = (min: number) => new Date(Date.UTC(2026, 9, 21, 8, min));

describe('checkpoint retention (D5)', () => {
  it('keeps the latest 20 automatic checkpoints and every labelled one', () => {
    const list: Checkpoint[] = [
      ...Array.from({ length: 23 }, (_, i) => newCheckpoint(project, `auto ${i}`, { auto: true, now: at(i) })),
      ...Array.from({ length: 30 }, (_, i) => newCheckpoint(project, `mine ${i}`, { now: at(i) }))
    ];
    expect(excess(list).map((c) => c.label)).toEqual(['auto 0', 'auto 1', 'auto 2']);
  });

  it('takes automatic checkpoints quietly, and never for a project without an identity', async () => {
    const store = new MemoryStore();
    await autoCheckpoint(project, 'Before issuing', store);
    await autoCheckpoint({ ...project, id: undefined }, 'Nothing', store);
    expect((await store.list('p-1')).map((c) => [c.label, c.auto])).toEqual([['Before issuing', true]]);
    const errors: string[] = [];
    await autoCheckpoint(project, 'Fails', { list: async () => [], put: async () => { throw new Error('disk full'); }, remove: async () => {} }, (m) => errors.push(m));
    expect(errors).toEqual(['Automatic checkpoint not saved: disk full']);
    expect((await saveCheckpoint(store, newCheckpoint(project, 'Mine', { now: new Date(Date.UTC(2099, 0, 1)) })))[0].label).toBe('Mine'); // newest first
  });
});

describe('portable project backup', () => {
  const checkpoints = [newCheckpoint(project, 'Before client comments', { now: at(1) }), newCheckpoint(project, 'Before issuing', { auto: true, now: at(2) })];

  it('round-trips the project and its checkpoints with a manifest check', async () => {
    const bytes = await buildBackup(project, checkpoints, '1.69', at(5));
    const r = await readBackup(bytes);
    expect(r.manifest).toMatchObject({ format: 'lvds-backup', formatVersion: 1, appVersion: '1.69', project: { id: 'p-1', name: project.name, schemaVersion: 1 } });
    expect(r.manifest.files.map((f) => f.path)).toEqual(['project.json', ...checkpoints.map((c) => `checkpoints/${c.id}.json`)]);
    expect(r.project).toEqual(project);
    expect(r.checkpoints.map((c) => c.label)).toEqual(['Before client comments', 'Before issuing']);
    // Opened as a new project: copies with their own ids, so the original project's checkpoints stay where they are.
    const store = new MemoryStore();
    for (const c of r.checkpoints) await store.put(c);
    for (const c of checkpointsFor(r.checkpoints, 'p-2-new-id')) await store.put(c);
    expect((await store.list('p-1')).length).toBe(2);
    expect((await store.list('p-2-new-id')).map((c) => c.label).sort()).toEqual(['Before client comments', 'Before issuing']);
  });

  it('refuses damaged, foreign or newer backups before anything is opened', async () => {
    const good = await buildBackup(project, checkpoints, '1.69');
    const tamper = async (fn: (z: JSZip) => void) => { const z = await JSZip.loadAsync(good); fn(z); return z.generateAsync({ type: 'uint8array' }); };
    await expect(readBackup(new TextEncoder().encode('not a zip'))).rejects.toThrow('not a zip file');
    await expect(readBackup(await tamper((z) => z.remove('manifest.json')))).rejects.toThrow('no manifest');
    await expect(readBackup(await tamper((z) => z.file('project.json', JSON.stringify({ ...project, name: 'Changed' }))))).rejects.toThrow('project.json in the backup is damaged');
    await expect(readBackup(await tamper((z) => z.remove('project.json')))).rejects.toThrow('missing project.json');
    const manifest = JSON.parse(await (await JSZip.loadAsync(good)).file('manifest.json')!.async('string'));
    await expect(readBackup(await tamper((z) => z.file('manifest.json', JSON.stringify({ ...manifest, formatVersion: 2, appVersion: '9.0' }))))).rejects.toThrow('newer LV Design Studio (9.0)');
    await expect(readBackup(await tamper((z) => z.file('manifest.json', JSON.stringify({ ...manifest, format: 'other' }))))).rejects.toThrow('not an LV Design Studio backup');
  });

  it('drops checkpoints that belong to another project', async () => {
    const other = newCheckpoint({ ...project, id: 'p-9' }, 'Other', { now: at(3) });
    const r = await readBackup(await buildBackup(project, [...checkpoints, other], '1.69'));
    expect(r.checkpoints.map((c) => c.label)).toEqual(['Before client comments', 'Before issuing']);
  });
});

describe('a crafted backup cannot fill memory before it is checked', () => {
  const MB = 1024 * 1024;
  const enc = new TextEncoder();
  const checkpoints = [newCheckpoint(project, 'Before issuing', { auto: true, now: at(2) })];
  const sha = (b: Uint8Array) => crypto.subtle.digest('SHA-256', b as BufferSource).then((d) => [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join(''));
  const manifestFor = (files: { path: string; bytes: number; sha256: string }[]) => ({ format: 'lvds-backup', formatVersion: 1, appVersion: '9.9', exportedAt: at(0).toISOString(), project: { name: 'P' }, files });

  /** A zip written by hand, to make what JSZip never writes: sizes that lie, the same entry listed many times. */
  function rawZip(entries: { name: string; data: Uint8Array; deflated?: boolean; size?: number }[], listed = 1): Uint8Array {
    const local: Uint8Array[] = [], central: Uint8Array[] = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.name), method = e.deflated ? 8 : 0, size = e.size ?? e.data.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, method, true);
      h.setUint32(18, e.data.length, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(10, method, true);
      c.setUint32(20, e.data.length, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      local.push(new Uint8Array(h.buffer), name, e.data);
      for (let i = 0; i < listed; i++) central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + e.data.length;
    }
    const n = entries.length * listed, cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, n, true); end.setUint16(10, n, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const parts = [...local, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  /** Bytes unpacked per zip entry while reading, in order (JSZip unpacks every entry through internalStream). */
  function countUnpacked(): number[] {
    type Stream = JSZip.JSZipStreamHelper<Uint8Array>;
    const proto = Object.getPrototypeOf(new JSZip().file('x', 'x').file('x')!) as { internalStream(type: string): Stream };
    const real = proto.internalStream;
    const counts: number[] = [];
    vi.spyOn(proto, 'internalStream').mockImplementation(function (this: unknown, type: string) {
      const i = counts.push(0) - 1;
      return real.call(this, type).on('data', (chunk) => { counts[i] += chunk.length; });
    });
    return counts;
  }

  // 48 MB of zeros, deflated to about 48 KB.
  const zeros = 48 * MB;
  const bomb = zlib.deflateRawSync(new Uint8Array(zeros));
  const withBomb = async (declared: number, extra: Record<string, unknown> = {}) => {
    const m = enc.encode(JSON.stringify({ ...manifestFor([{ path: 'project.json', bytes: declared, sha256: await sha(new Uint8Array(0)) }]), ...extra }));
    return rawZip([{ name: 'manifest.json', data: m }, { name: 'project.json', data: bomb, deflated: true, size: declared }]);
  };
  afterEach(() => { vi.restoreAllMocks(); });

  it('checks a picked file\'s size before reading it into memory', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    await expect(readBackupFile({ size: 200 * MB + 1, arrayBuffer } as unknown as Blob)).rejects.toThrow('larger than 200 MB');
    expect(arrayBuffer).not.toHaveBeenCalled();
    const good = await buildBackup(project, checkpoints, '1.69');
    const picked = { size: good.length, arrayBuffer: async () => good.slice().buffer } as unknown as Blob;
    expect((await readBackupFile(picked)).project).toEqual(project);
  });

  it('stops unpacking an entry as soon as it holds more than the manifest says', async () => {
    const unpacked = countUnpacked();
    await expect(readBackup(await withBomb(100))).rejects.toThrow('project.json in the backup is damaged');
    expect(unpacked).toHaveLength(2); // the manifest, then project.json…
    expect(unpacked[1]).toBeLessThan(20 * MB); // …given up within one 16 KB block of the zip, not all 48 MB
  });

  it('refuses sizes no real backup has before unpacking any file', async () => {
    const unpacked = countUnpacked();
    await expect(readBackup(await withBomb(zeros))).rejects.toThrow('The backup manifest is damaged'); // 1000 times its zip
    await expect(readBackup(await withBomb(600 * MB))).rejects.toThrow('The backup unpacks to more than 512 MB');
    expect(unpacked).toHaveLength(2); // the two manifests only
  });

  it('refuses a manifest that lists a file twice, has a bad size, or is too large, before unpacking any file', async () => {
    const data = enc.encode(JSON.stringify(project));
    const listed = { path: 'project.json', bytes: data.length, sha256: await sha(data) };
    const zip = (m: unknown) => rawZip([{ name: 'manifest.json', data: enc.encode(JSON.stringify(m)) }, { name: 'project.json', data }]);
    expect((await readBackup(zip(manifestFor([listed])))).project).toEqual(project);
    const unpacked = countUnpacked();
    for (const m of [manifestFor([listed, listed]), manifestFor([{ ...listed, bytes: -1 }]), manifestFor([{ ...listed, bytes: 1.5 }]), { ...manifestFor([listed]), pad: 'x'.repeat(MB) }]) {
      await expect(readBackup(zip(m))).rejects.toThrow('The backup manifest is damaged');
    }
    expect(unpacked).toHaveLength(4); // each manifest, and nothing it lists
    expect(Math.max(...unpacked)).toBeLessThan(1.1 * MB);
  });

  it('counts the zip\'s entries before JSZip reads them', async () => {
    const load = vi.spyOn(JSZip, 'loadAsync');
    await expect(readBackup(rawZip([{ name: 'manifest.json', data: enc.encode('{}') }], 600))).rejects.toThrow('too many files');
    const good = await buildBackup(project, checkpoints, '1.69');
    const prepended = new Uint8Array(good.length + 10);
    prepended.set(good, 10);
    await expect(readBackup(prepended)).rejects.toThrow('not a zip file');
    expect(load).not.toHaveBeenCalled();
    // The most a backup held before still opens: the project, 498 checkpoints, their folder and the manifest.
    const small: Project = { ...project, boards: [], feeders: [] };
    const many = Array.from({ length: 498 }, (_, i) => newCheckpoint(small, `c${i}`, { now: at(i) }));
    expect((await readBackup(await buildBackup(small, many, '1.69'))).checkpoints).toHaveLength(498);
    await expect(readBackup(await buildBackup(small, [...many, newCheckpoint(small, 'one more', { now: at(600) })], '1.69'))).rejects.toThrow('too many files');
  });
});
