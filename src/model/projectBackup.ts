import type JSZip from 'jszip';
import type { Project } from '../types';
import type { Checkpoint } from './checkpoints';

/** A portable backup of one project: the project, its checkpoints (which otherwise stay on one computer) and a manifest
 * with a SHA-256 check of every file, in one zip named "<project>.lvds-backup". Import verifies everything before
 * anything is opened. */
export const BACKUP_FORMAT = 'lvds-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXT = 'lvds-backup';
const MB = 1024 * 1024;
const MAX_BACKUP_BYTES = 200 * MB;
const MAX_FILES = 500;
// What a backup may unpack to, checked before anything is unpacked and again while it is (a crafted zip that expands
// to gigabytes stops there, not when memory runs out). Far above real backups, which are 5–25 times their zip.
const MAX_MANIFEST_BYTES = 1 * MB;
const MAX_UNPACKED_BYTES = 512 * MB;
const MAX_RATIO = 100;

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  project: { id?: string; name: string; schemaVersion?: number };
  files: { path: string; bytes: number; sha256: string }[];
}

export interface ReadBackup { manifest: BackupManifest; project: Project; checkpoints: Checkpoint[] }

const enc = new TextEncoder();
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'file';

/** The backup zip for a project and its checkpoints. */
export async function buildBackup(project: Project, checkpoints: Checkpoint[], appVersion: string, now = new Date()): Promise<Uint8Array> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const files: BackupManifest['files'] = [];
  const add = async (path: string, value: unknown) => {
    const bytes = enc.encode(JSON.stringify(value));
    zip.file(path, bytes);
    files.push({ path, bytes: bytes.length, sha256: await sha256(bytes) });
  };
  await add('project.json', project);
  for (const c of [...checkpoints].sort((a, b) => a.at.localeCompare(b.at))) await add(`checkpoints/${safe(c.id)}.json`, c);
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, appVersion, exportedAt: now.toISOString(),
    project: { ...(project.id ? { id: project.id } : {}), name: project.name, ...(project.schemaVersion !== undefined ? { schemaVersion: project.schemaVersion } : {}) },
    files
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** How many entries the zip's central directory lists, counted as JSZip will read them, before JSZip reads them: a
 * crafted zip can list millions of tiny entries. Only plain zips as buildBackup writes them (no zip64, nothing
 * before or inside the archive). Throws when there are more than `max`. */
function checkZipDirectory(bytes: Uint8Array, max: number): void {
  const notZip = () => new Error('This is not an LV Design Studio backup (not a zip file).');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 4; // the last end-of-central-directory record, as JSZip finds it
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || end + 22 > bytes.length) throw notZip();
  const [disk, cdDisk, onDisk, records] = [4, 6, 8, 10].map((o) => v.getUint16(end + o, true));
  const [size, offset] = [12, 16].map((o) => v.getUint32(end + o, true));
  if ([disk, cdDisk, onDisk, records].includes(0xffff) || size === 0xffffffff || offset === 0xffffffff || offset + size !== end) throw notZip();
  let n = 0;
  for (let at = offset; at + 4 <= bytes.length && v.getUint32(at, true) === 0x02014b50; n++) {
    if (n >= max) throw new Error('The backup holds too many files.');
    if (at + 46 > bytes.length) break;
    at += 46 + v.getUint16(at + 28, true) + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
  }
}

/** An entry's bytes, unpacked piece by piece: undefined as soon as it holds more than `max`, before the rest is
 * unpacked. */
function unpack(entry: JSZip.JSZipObject, max: number): Promise<Uint8Array | undefined> {
  return new Promise((resolve, reject) => {
    const parts: Uint8Array[] = [];
    let n = 0;
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array');
    stream
      .on('data', (chunk) => {
        if (n > max) return;
        n += chunk.length;
        if (n > max) { stream.pause(); resolve(undefined); } else parts.push(chunk);
      })
      .on('error', reject)
      .on('end', () => {
        const out = new Uint8Array(n);
        let at = 0;
        for (const p of parts) { out.set(p, at); at += p.length; }
        resolve(out);
      })
      .resume();
  });
}

/** readBackup of a file the user picked: its size is checked before it is read into memory. */
export async function readBackupFile(file: Blob): Promise<ReadBackup> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('The backup is larger than 200 MB.');
  return readBackup(new Uint8Array(await file.arrayBuffer()));
}

/** Reads and verifies a backup: the manifest, every listed file's size and SHA-256, a project that looks like a project,
 * and checkpoints that belong to it. Throws a plain message on the first problem; nothing is opened before it passes.
 * Sizes are checked before anything is unpacked: the zip's entries, the manifest, and every listed file. */
export async function readBackup(bytes: Uint8Array): Promise<ReadBackup> {
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error('The backup is larger than 200 MB.');
  checkZipDirectory(bytes, MAX_FILES + 1);
  const JSZip = (await import('jszip')).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error('This is not an LV Design Studio backup (not a zip file).'); }
  if (Object.keys(zip.files).length > MAX_FILES + 1) throw new Error('The backup holds too many files.');
  const mf = zip.file('manifest.json');
  if (!mf) throw new Error('This is not an LV Design Studio backup (no manifest).');
  let manifest: BackupManifest;
  try {
    const m = await unpack(mf, MAX_MANIFEST_BYTES);
    if (!m) throw new Error('too large');
    manifest = JSON.parse(new TextDecoder().decode(m));
  } catch { throw new Error('The backup manifest is damaged.'); }
  if (!isObj(manifest) || manifest.format !== BACKUP_FORMAT || !Array.isArray(manifest.files)) throw new Error('This is not an LV Design Studio backup.');
  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(`This backup was made by a newer LV Design Studio (${String(manifest.appVersion)}); update the app to open it.`);
  }
  // Every listed file once, with a whole-number size; all of them together within the limits.
  const listed = new Set<string>();
  let total = 0;
  for (const f of manifest.files) {
    if (!isObj(f) || typeof f.path !== 'string' || typeof f.sha256 !== 'string' || !Number.isSafeInteger(f.bytes) || f.bytes < 0 || listed.has(f.path)) throw new Error('The backup manifest is damaged.');
    listed.add(f.path);
    total += f.bytes;
  }
  if (listed.size > MAX_FILES) throw new Error('The backup holds too many files.');
  if (total > MAX_UNPACKED_BYTES) throw new Error(`The backup unpacks to more than ${MAX_UNPACKED_BYTES / MB} MB.`);
  if (total > MAX_RATIO * bytes.length + MB) throw new Error('The backup manifest is damaged.'); // far more than its zip could hold
  const contents = new Map<string, unknown>();
  for (const f of manifest.files) {
    const entry = zip.file(f.path);
    if (!entry) throw new Error(`The backup is missing ${f.path}.`);
    let data: Uint8Array | undefined;
    try { data = await unpack(entry, f.bytes); } catch { data = undefined; }
    if (!data || data.length !== f.bytes || (await sha256(data)) !== f.sha256) throw new Error(`${f.path} in the backup is damaged (its check does not match).`);
    try { contents.set(f.path, JSON.parse(new TextDecoder().decode(data))); } catch { throw new Error(`${f.path} in the backup is not readable.`); }
  }
  const project = contents.get('project.json');
  if (!isObj(project) || !Array.isArray(project.boards) || !Array.isArray(project.feeders)) throw new Error('The backup holds no LV Design Studio project.');
  const checkpoints = [...contents.entries()]
    .filter(([path]) => path.startsWith('checkpoints/'))
    .map(([, c]) => c)
    .filter((c): c is Checkpoint => isObj(c) && typeof c.id === 'string' && typeof c.at === 'string' && isObj(c.project) && c.projectId === (project as unknown as Project).id);
  return { manifest, project: project as unknown as Project, checkpoints };
}

/** Copies of the checkpoints for another project id (a backup opened as a new project keeps its history). Each copy gets
 * its own id — checkpoints are stored by id, so reusing one would move the original project's checkpoint instead. */
export const checkpointsFor = (list: Checkpoint[], projectId: string): Checkpoint[] =>
  list.map((c) => ({ ...c, id: `${c.id}-${projectId.slice(0, 8)}`, projectId }));
