import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Fn = (...a: unknown[]) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
const L = createRequire(import.meta.url)('../../electron/errorLog.cjs') as Record<'appendError' | 'watchWindow', Fn> & { MAX_BYTES: number };

const canLink = (() => {
  const d = mkdtempSync(join(tmpdir(), 'lvds-link-'));
  try { symlinkSync(join(d, 'x'), join(d, 'y')); return true; } catch { return false; } finally { rmSync(d, { recursive: true, force: true }); }
})();
const it_ = canLink ? it : it.skip; // skipped where symbolic links cannot be created (Windows without the right)

describe('the desktop log file (electron/errorLog.cjs)', () => {
  let root: string, dir: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'lvds-error-log-')); dir = join(root, 'logs'); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('creates its folder and adds entries in order', () => {
    expect(L.appendError(dir, 'first')).toBe(true);
    expect(L.appendError(dir, 'second')).toBe(true);
    expect(readFileSync(join(dir, 'errors.log'), 'utf-8')).toBe('first\n\nsecond\n\n');
  });

  it.skipIf(process.platform === 'win32')('is private to this user', () => {
    L.appendError(dir, 'private');
    expect(statSync(join(dir, 'errors.log')).mode & 0o777).toBe(0o600);
  });

  it('moves a full log aside, so the two files together stay small', () => {
    L.appendError(dir, 'x'.repeat(L.MAX_BYTES + 1));
    L.appendError(dir, 'after');
    expect(readFileSync(join(dir, 'errors.log'), 'utf-8')).toBe('after\n\n');
    expect(statSync(join(dir, 'errors.old.log')).size).toBeGreaterThan(L.MAX_BYTES);
    L.appendError(dir, 'y'.repeat(L.MAX_BYTES + 1));
    L.appendError(dir, 'later');
    expect(readFileSync(join(dir, 'errors.log'), 'utf-8')).toBe('later\n\n');
    expect(statSync(join(dir, 'errors.old.log')).size).toBeLessThan(L.MAX_BYTES + 100); // the older one has gone
  });

  it_('never writes through a link at its own name', () => {
    mkdirSync(dir);
    const victim = join(root, 'victim.txt');
    writeFileSync(victim, 'must never change');
    symlinkSync(victim, join(dir, 'errors.log'));
    expect(L.appendError(dir, 'planted')).toBe(false);
    expect(readFileSync(victim, 'utf-8')).toBe('must never change');
    expect(readlinkSync(join(dir, 'errors.log'))).toBe(victim);
  });

  it_('never writes into a linked folder', () => {
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, dir);
    expect(L.appendError(dir, 'planted')).toBe(false);
    expect(() => readFileSync(join(elsewhere, 'errors.log'))).toThrow();
  });

  it('answers false rather than throwing when it cannot write', () => {
    writeFileSync(dir, 'a file where the folder should be');
    expect(L.appendError(dir, 'nowhere')).toBe(false);
  });
});

describe('the way from the page to the log file', () => {
  // Only the window test (tests/electron) can run these; this keeps the two names from drifting apart.
  it('uses the same name in the bridge and the app', () => {
    expect(readFileSync('electron/preload.cjs', 'utf-8')).toContain("ipcRenderer.invoke('log:error', text)");
    expect(readFileSync('electron/main.cjs', 'utf-8')).toContain("handle('log:error', (_evt, text) => errorLog.appendError(logDir, check.logText(text)));");
  });
});

describe('a window that dies or stops answering (electron/errorLog.cjs)', () => {
  const STOPPED = 'LV Design Studio stopped', HUNG = 'LV Design Studio is not responding';

  function watched(...answers: number[]) {
    const wc = Object.assign(new EventEmitter(), { reload: vi.fn(), forcefullyCrashRenderer: vi.fn() });
    const win = { webContents: wc, isDestroyed: vi.fn(() => false) };
    const log = vi.fn();
    const quit = vi.fn();
    const asked: { title: string; signal?: AbortSignal; buttons: string[] }[] = [];
    let answer: ((r: { response: number }) => void) | null = null;
    const showMessageBox = vi.fn((_w: unknown, o: { title: string; signal?: AbortSignal; buttons: string[] }) => {
      asked.push(o);
      // Answers given up front answer at once; otherwise the question stays open until answerNow.
      if (answers.length) return Promise.resolve({ response: answers.shift()! });
      return new Promise((done) => {
        answer = done;
        o.signal?.addEventListener('abort', () => done({ response: 0 }));
      });
    });
    L.watchWindow(win, { dialog: { showMessageBox }, log, quit, version: '2.029' });
    const settle = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
    const emit = async (event: string, ...args: unknown[]) => { wc.emit(event, ...args); await settle(); };
    return { wc, win, log, quit, asked, emit, answerNow: async (response: number) => { answer?.({ response }); await settle(); } };
  }
  const crash = (reason = 'crashed') => [{}, { reason, exitCode: 11 }];

  it('a crash is logged, with why, and asks', async () => {
    const w = watched(0);
    await w.emit('render-process-gone', ...crash('oom'));
    expect(w.log.mock.calls[0][0]).toMatch(/LV Design Studio 2\.029 .* the page stopped: oom \(exit code 11\)/);
    expect(w.asked.map((a) => a.title)).toEqual([STOPPED]);
    expect(w.asked[0].buttons).toEqual(['Reload', 'Quit']);
  });

  it('Reload brings the page back, Quit quits', async () => {
    const r = watched(0);
    await r.emit('render-process-gone', ...crash());
    expect(r.wc.reload).toHaveBeenCalledTimes(1);
    expect(r.quit).not.toHaveBeenCalled();
    const q = watched(1);
    await q.emit('render-process-gone', ...crash());
    expect(q.wc.reload).not.toHaveBeenCalled();
    expect(q.quit).toHaveBeenCalledTimes(1);
  });

  it('asks nothing when the page closed normally or the window has gone', async () => {
    const clean = watched();
    await clean.emit('render-process-gone', ...crash('clean-exit'));
    expect(clean.asked).toEqual([]);
    const gone = watched();
    gone.win.isDestroyed.mockReturnValue(true);
    await gone.emit('render-process-gone', ...crash());
    expect(gone.asked).toEqual([]);
    expect(gone.log).toHaveBeenCalledTimes(1);
  });

  it('does nothing to a window closed while the question was open', async () => {
    const w = watched();
    await w.emit('render-process-gone', ...crash());
    w.win.isDestroyed.mockReturnValue(true);
    await w.answerNow(0);
    expect(w.wc.reload).not.toHaveBeenCalled();
  });

  it('a window not responding is logged, and waiting is the first answer offered', async () => {
    const w = watched(0);
    await w.emit('unresponsive');
    expect(w.log.mock.calls[0][0]).toContain('the window stopped responding');
    expect(w.asked.map((a) => a.title)).toEqual([HUNG]);
    expect(w.asked[0].buttons).toEqual(['Keep waiting', 'Reload']);
    expect(w.wc.forcefullyCrashRenderer).not.toHaveBeenCalled();
    expect(w.wc.reload).not.toHaveBeenCalled();
  });

  it('asks one question at a time, and again after Keep waiting', async () => {
    const w = watched();
    await w.emit('unresponsive');
    await w.emit('unresponsive');
    expect(w.asked).toHaveLength(1);
    expect(w.log).toHaveBeenCalledTimes(2);
    await w.answerNow(0);
    await w.emit('unresponsive');
    expect(w.asked).toHaveLength(2);
  });

  it('Reload ends the stuck page and reloads only once it has gone: sooner, the reload is lost with the page', async () => {
    const w = watched(1);
    await w.emit('unresponsive');
    expect(w.wc.forcefullyCrashRenderer).toHaveBeenCalledTimes(1);
    expect(w.wc.reload).not.toHaveBeenCalled();
    await w.emit('render-process-gone', ...crash('killed'));
    expect(w.wc.reload).toHaveBeenCalledTimes(1);
  });

  it('that ending does not then ask about a crash, but a real crash afterwards does', async () => {
    const w = watched(1, 0);
    await w.emit('unresponsive');
    await w.emit('render-process-gone', ...crash('killed'));
    expect(w.asked).toHaveLength(1);
    expect(w.log.mock.calls.join()).not.toContain('the page stopped');
    await w.emit('did-finish-load');
    await w.emit('render-process-gone', ...crash());
    expect(w.asked).toHaveLength(2);
    expect(w.asked[1].title).toBe(STOPPED);
  });

  it('the page answering again withdraws the question, with nothing reloaded', async () => {
    const w = watched();
    await w.emit('unresponsive');
    await w.emit('responsive');
    expect(w.asked[0].signal?.aborted).toBe(true);
    expect(w.log.mock.calls[1][0]).toContain('responding again');
    expect(w.wc.reload).not.toHaveBeenCalled();
    await w.emit('unresponsive');
    expect(w.asked).toHaveLength(2); // and it can ask again
  });
});
