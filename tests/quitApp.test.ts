import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// scripts/quit-app.sh, run by update-app before it replaces the installed app: it asks the open app to quit and
// waits until it has really closed. An app that stays open (asking about unsaved changes, say) stops the install,
// so a running copy is never replaced under itself. Tried with stand-ins for pgrep, osascript and sleep.
const script = resolve(__dirname, '../scripts/quit-app.sh');
let bin = '';

/** Stand-ins on PATH that log their calls: pgrep finds the app open for its first `openFor` checks. */
const stubs = (openFor: number) => {
  bin = mkdtempSync(join(tmpdir(), 'lvds-quit-'));
  const tool = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/bash\necho "${name} $*" >> "${bin}/log"\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  tool('pgrep', `n=$(cat "${bin}/n" 2>/dev/null || echo 0); echo $((n + 1)) > "${bin}/n"; [ "$n" -lt ${openFor} ]`);
  tool('osascript', '');
  tool('sleep', '');
};
const run = (wait: number) =>
  spawnSync('bash', [script, 'LV Design Studio', String(wait)], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' });
const calls = () => (existsSync(join(bin, 'log')) ? readFileSync(join(bin, 'log'), 'utf8').trim().split('\n') : []);
const count = (call: string) => calls().filter((c) => c === call).length;

afterEach(() => { if (bin) rmSync(bin, { recursive: true, force: true }); bin = ''; });

describe.skipIf(process.platform === 'win32')('update-app quits the open app before replacing it', () => {
  it('does nothing when the app is not open', () => {
    stubs(0);
    const r = run(60);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(calls()).toEqual(['pgrep -xq LV Design Studio']);
  });

  it('asks the app to quit and goes on once it has closed', () => {
    stubs(3); // open, then still closing at the next two checks
    const r = run(60);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Waiting for LV Design Studio to close');
    expect(r.stdout).not.toContain('still open');
    expect(calls().filter((c) => c.startsWith('osascript'))).toEqual(['osascript -e quit app "LV Design Studio"']);
    expect(count('sleep 1')).toBe(3);
  });

  it('stops, replacing nothing, when the app is still open after the wait', () => {
    stubs(1000);
    const r = run(5);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('LV Design Studio is still open, perhaps asking about unsaved changes. Nothing was replaced');
    expect(count('sleep 1')).toBe(5);
  });

  it('is what update-app runs before it removes the installed app', () => {
    const text = readFileSync(resolve(__dirname, '../scripts/update-app.sh'), 'utf8');
    expect(text).toMatch(/^set -euo pipefail$/m); // the helper's exit 1 stops the install
    const quit = text.indexOf('bash scripts/quit-app.sh "$APP"'), remove = text.indexOf('rm -rf "$DEST"');
    expect(quit).toBeGreaterThan(0);
    expect(quit).toBeLessThan(remove);
  });
});
