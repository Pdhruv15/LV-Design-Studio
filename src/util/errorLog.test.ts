// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorLogText, errorText, logError, readErrorLog, watchForErrors } from './errorLog';

const bridge = window as unknown as { lvds?: unknown };

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete bridge.lvds;
});

describe('the error log', () => {
  it('keeps what went wrong, where, and in which version', () => {
    const entry = logError('page', new Error('Board not found'), '\n    at BoardView');
    expect(entry).toMatchObject({ kind: 'page', message: 'Board not found', where: '\n    at BoardView', version: __APP_VERSION__ });
    expect(entry.stack).toContain('Board not found');
    expect(new Date(entry.at).getTime()).not.toBeNaN();
    expect(readErrorLog()).toEqual([entry]);
  });

  it('takes what was thrown even when it is not an Error', () => {
    const entry = logError('promise', 'just some text');
    expect(entry.message).toBe('just some text');
    expect(entry.stack).toBeUndefined();
  });

  it('keeps only the last 30', () => {
    for (let i = 0; i < 35; i += 1) logError('script', new Error(`number ${i}`));
    const log = readErrorLog();
    expect(log).toHaveLength(30);
    expect(log[0].message).toBe('number 5');
    expect(log[29].message).toBe('number 34');
  });

  it('writes the same error once while it keeps repeating, and again later', () => {
    vi.useFakeTimers();
    logError('script', new Error('on every mouse move'));
    vi.advanceTimersByTime(4000);
    const again = logError('script', new Error('on every mouse move'));
    expect(again.message).toBe('on every mouse move'); // the caller still gets it, for its own screen
    expect(readErrorLog()).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    logError('script', new Error('on every mouse move'));
    expect(readErrorLog()).toHaveLength(2);
  });

  it('cuts very long text, so one entry cannot fill the storage', () => {
    const e = new Error('m'.repeat(5000));
    e.stack = 's'.repeat(20000);
    const entry = logError('script', e, 'w'.repeat(20000));
    expect(entry.message.length).toBe(1001);
    expect(entry.stack?.length).toBe(4001);
    expect(entry.where?.length).toBe(4001);
  });

  it('reads damaged or foreign storage as no entries', () => {
    localStorage.setItem('lvds.errorLog', '{not json');
    expect(readErrorLog()).toEqual([]);
    localStorage.setItem('lvds.errorLog', '{"a":1}');
    expect(readErrorLog()).toEqual([]);
    localStorage.setItem('lvds.errorLog', '[null,{"message":3},{"message":"good"}]');
    expect(readErrorLog().map((e) => e.message)).toEqual(['good']);
  });

  it('never throws, even with storage blocked: logging an error must not cause another', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => logError('script', new Error('storage blocked'))).not.toThrow();
    expect(readErrorLog()).toEqual([]);
  });

  it('also writes to the desktop app\'s log file, when there is one', async () => {
    const error = vi.fn().mockResolvedValue(true);
    bridge.lvds = { log: { error } };
    const entry = logError('app', new Error('for the file'));
    expect(error).toHaveBeenCalledWith(errorText(entry));
    expect(errorText(entry)).toContain('(desktop)');
  });

  it('does not mind a desktop log that fails or an older desktop build without one', async () => {
    bridge.lvds = { log: { error: vi.fn().mockRejectedValue(new Error('refused')) } };
    expect(() => logError('app', new Error('file refused'))).not.toThrow();
    await new Promise((r) => { setTimeout(r); }); // a rejection left unhandled would fail this test
    bridge.lvds = {};
    expect(() => logError('app', new Error('older build'))).not.toThrow();
    expect(readErrorLog()).toHaveLength(2);
  });
});

describe('an entry as text', () => {
  it('has all that is needed to trace it, once', () => {
    const entry = logError('page', new Error('Cable size missing'), '\n    at CableTable');
    const text = errorText(entry);
    expect(text).toContain(`LV Design Studio ${__APP_VERSION__} (web)`);
    expect(text).toContain(entry.at);
    expect(text).toContain('page');
    expect(text.match(/Cable size missing/g)).toHaveLength(1); // the stack starts with the message
    expect(text).toContain('In:\n    at CableTable');
    expect(text).toContain(navigator.userAgent);
  });

  it('shows the message when there is no stack to carry it', () => {
    expect(errorText(logError('promise', 'plain reason'))).toContain('plain reason');
  });

  it('copies the whole log, one entry after another', () => {
    logError('script', new Error('first of two'));
    logError('script', new Error('second of two'));
    const text = errorLogText();
    expect(text.indexOf('first of two')).toBeLessThan(text.indexOf('second of two'));
  });
});

describe('errors nothing caught', () => {
  it('records them, but not the browser\'s harmless resize notice', () => {
    watchForErrors();
    window.dispatchEvent(new ErrorEvent('error', { message: 'x is not a function', error: new Error('x is not a function') }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new Error('nobody waited for this') }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' }));
    expect(readErrorLog().map((e) => [e.kind, e.message])).toEqual([
      ['script', 'x is not a function'],
      ['script', 'Script error.'],
      ['promise', 'nobody waited for this']
    ]);
  });
});
