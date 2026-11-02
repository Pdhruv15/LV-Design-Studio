import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// scripts/update-shared-folder.sh, run by update-app: the repository's main folder (where sessions start, on a
// detached commit because main is checked out in a worktree) moves to the latest main with its uncommitted notes,
// or stays as it is, saying why, when that could lose or tangle work. Tried on a throwaway repository laid out alike.
const script = resolve(__dirname, '../scripts/update-shared-folder.sh');
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
const lines = (changes: Record<number, string> = {}) => Array.from({ length: 12 }, (_, i) => changes[i + 1] ?? `line ${i + 1}`).join('\n') + '\n';

let root: string, seed: string, shared: string, wtMain: string;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
const commit = (files: Record<string, string>, message: string) => {
  for (const [f, text] of Object.entries(files)) writeFileSync(join(seed, f), text);
  git(seed, 'add', '-A'); git(seed, 'commit', '-qm', message); git(seed, 'push', '-q', join(root, 'origin.git'), 'main');
};
/** main moves on, and the worktree holding it fetches (the fetch update-app makes). */
const mainMovesOn = (files: Record<string, string>) => { commit(files, 'main moves on'); git(wtMain, 'fetch', '-q', 'origin', 'main'); };
const run = () => execFileSync('bash', [script, shared], { env, encoding: 'utf8' }).trim();
const read = (f: string) => readFileSync(join(shared, f), 'utf8');
const head = () => git(shared, 'rev-parse', 'HEAD');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lvds-shared-'));
  seed = join(root, 'seed'); shared = join(root, 'shared'); wtMain = join(root, 'wt-main');
  git(root, 'init', '-q', '-b', 'main', seed);
  git(root, 'init', '-q', '--bare', '-b', 'main', join(root, 'origin.git'));
  commit({ 'notes.md': lines(), 'app.txt': 'v1\n' }, 'base');
  git(root, 'clone', '-q', join(root, 'origin.git'), shared);
  git(shared, 'checkout', '-q', '--detach');
  git(shared, 'worktree', 'add', '-q', wtMain, 'main');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe.skipIf(process.platform === 'win32')('update-app brings the shared folder up to date', () => {
  it('moves to the latest main and keeps an uncommitted edit and untracked notes', () => {
    writeFileSync(join(shared, 'notes.md'), lines({ 2: 'my note' }));
    writeFileSync(join(shared, 'idea.md'), 'untracked idea\n');
    mainMovesOn({ 'notes.md': lines({ 9: "main's change" }), 'app.txt': 'v2\n' });
    expect(run()).toMatch(/^Shared folder: moved from \w+ to \w+ main moves on, keeping 1 edited file\(s\)\.$/);
    expect(head()).toBe(git(wtMain, 'rev-parse', 'origin/main'));
    expect(read('notes.md')).toBe(lines({ 2: 'my note', 9: "main's change" }));
    expect(read('app.txt')).toBe('v2\n');
    expect(read('idea.md')).toBe('untracked idea\n');
    expect(git(shared, 'branch', '--show-current')).toBe(''); // still detached: main stays in its worktree
    expect(run()).toBe('Shared folder: already on the latest main.');
  });

  it('stays as it is when an edit would clash with main\'s change to the same lines', () => {
    writeFileSync(join(shared, 'notes.md'), lines({ 9: 'my note' }));
    const before = head();
    mainMovesOn({ 'notes.md': lines({ 9: "main's change" }) });
    expect(run()).toContain('left as it is, as these would not carry over to main cleanly:\n  notes.md (edited here; main changed it too)');
    expect(head()).toBe(before);
    expect(read('notes.md')).toBe(lines({ 9: 'my note' }));
  });

  it('stays as it is when an untracked file is where main now has one', () => {
    writeFileSync(join(shared, 'plan.md'), 'my draft\n');
    const before = head();
    mainMovesOn({ 'plan.md': 'the committed plan\n' });
    expect(run()).toContain('plan.md (untracked here; main has it now)');
    expect(head()).toBe(before);
    expect(read('plan.md')).toBe('my draft\n');
  });

  it('stays as it is on a branch, with staged changes, or with commits main doesn\'t have', () => {
    mainMovesOn({ 'app.txt': 'v2\n' });
    git(shared, 'switch', '-q', '-c', 'work');
    expect(run()).toBe("Shared folder: on branch 'work', left as it is.");
    git(shared, 'switch', '-q', '--detach', 'HEAD');
    writeFileSync(join(shared, 'notes.md'), lines({ 2: 'staged' }));
    git(shared, 'add', 'notes.md');
    expect(run()).toBe('Shared folder: has staged changes, left as it is.');
    git(shared, 'commit', '-qm', 'local work');
    expect(run()).toBe("Shared folder: has commits that aren't on main, left as it is.");
    expect(read('app.txt')).toBe('v1\n');
  });

  it('says so when its packages are older than main\'s, and leaves them', () => {
    mainMovesOn({ 'package-lock.json': '{}\n' });
    expect(run()).toContain('its packages are older than main\'s now');
    expect(existsSync(join(shared, 'node_modules'))).toBe(false); // nothing installed
  });

  it('is run by update-app right after it fetches, for the main folder unless that is where update-app runs', () => {
    const app = readFileSync(resolve(__dirname, '../scripts/update-app.sh'), 'utf8');
    const call = app.indexOf('bash scripts/update-shared-folder.sh "$SHARED" || true');
    expect(call).toBeGreaterThan(app.indexOf('git fetch -q origin main'));
    expect(call).toBeLessThan(app.indexOf('Already up to date'));
    expect(app).toContain('[ "$SHARED" != "$(pwd -P)" ]');
  });
});
