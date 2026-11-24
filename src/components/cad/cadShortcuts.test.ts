import { describe, expect, it } from 'vitest';
import { CAD_COMMANDS, aliasesOf, cadCommand, commandFullName, commandId } from './cadCommands';
import { commandList, matchingCommands, spaceEnters } from './cadPrompt';
import { STANDARD_KEYS, aliasProblem, chordLabel, chordOf, commandOfKey, commandRows, keyProblem, keysOf, ownAliases, ownKeys } from './cadShortcuts';

const key = (k: string, m: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean; code?: string } = {}) => ({ key: k, code: m.code, ctrlKey: !!m.ctrl, metaKey: !!m.meta, altKey: !!m.alt, shiftKey: !!m.shift });
const copy = CAD_COMMANDS.find((c) => c.aliases.includes('COPY'))!;

describe('Design CAD own typed names and keys', () => {
  it('gives every standard key the id of a command', () => {
    const ids = new Set(CAD_COMMANDS.map(commandId));
    for (const [chord, id] of Object.entries(STANDARD_KEYS)) expect(ids.has(id), chord).toBe(true);
  });

  it('keeps good names and drops bad ones', () => {
    expect(ownAliases({ CC2: 'CO', 'bad name': 'CO', LINE: 'CO', ZZ: 'NOPE', Q: 5 })).toEqual({ CC2: 'CO' });
    expect(ownAliases(null)).toEqual({});
    expect(ownAliases([1])).toEqual({});
    expect(ownAliases({ '1A': 'CO' })).toEqual({});
  });

  it('says why a name cannot be added', () => {
    expect(aliasProblem('C', 'CO', {})).toBe('C is the typed name of CIRCLE. Choose another.');
    expect(aliasProblem('COPY', 'CO', {})).toBe('COPY is already a typed name of COPY.');
    expect(aliasProblem('MYC', 'CO', { MYC: 'C' })).toBe('MYC is the typed name of CIRCLE. Choose another.');
    expect(aliasProblem('MYC', 'C', { MYC: 'C' })).toBe('MYC is already a typed name of CIRCLE.');
    expect(aliasProblem('1X', 'CO', {})).toBe('Letters and digits only, starting with a letter (16 at most).');
    expect(aliasProblem('', 'CO', {})).toBe('Letters and digits only, starting with a letter (16 at most).');
    expect(aliasProblem('FREE', 'CO', {})).toBeNull();
  });

  it('finds a command by an own name; a standard name wins', () => {
    expect(cadCommand('CX', { CX: 'CO' })).toBe(copy);
    expect(cadCommand('CX')).toBeUndefined();
    expect(cadCommand('C', { C: 'CO' })).toBe(CAD_COMMANDS.find((c) => c.aliases.includes('CIRCLE')));
    expect(aliasesOf(copy, { CX: 'CO' })).toEqual(['CO', 'CP', 'COPY', 'CX']);
    expect(aliasesOf(copy)).toBe(copy.aliases);
    expect(commandFullName(copy)).toBe('COPY');
  });

  it('shows an own name in the suggestions, Space and the list, and is unchanged without one', () => {
    const own = { CX: 'CO' };
    expect(matchingCommands('CX', 8, own).map((m) => m.alias)).toContain('CX');
    expect(matchingCommands('CX').map((m) => m.alias)).not.toContain('CX');
    expect(spaceEnters('CX', 'command', [], own)).toBe(true);
    expect(spaceEnters('CX', 'command', [])).toBe(false);
    expect(commandList(own).find((c) => c.desc === 'Copy')?.aliases).toBe('CO · CP · COPY · CX');
    expect(commandList()).toEqual(commandList({}));
  });

  it('reads a key press as a chord', () => {
    expect(chordOf(key('F4'))).toBe('F4');
    expect(chordOf(key('F5', { shift: true }))).toBe('Shift+F5');
    expect(chordOf(key('2', { ctrl: true }))).toBe('Ctrl+2');
    expect(chordOf(key('2', { meta: true }))).toBe('Ctrl+2');
    expect(chordOf(key('@', { ctrl: true, shift: true, code: 'Digit2' }))).toBe('Ctrl+Shift+2');
    expect(chordOf(key('a'))).toBeNull();
    expect(chordOf(key('2'))).toBeNull();
    expect(chordOf(key('F10', { shift: true }))).toBeNull();
    expect(chordOf(key('F4', { alt: true }))).toBeNull();
  });

  it('writes a chord for the platform', () => {
    expect(chordLabel('Ctrl+2', true)).toBe('⌘2');
    expect(chordLabel('Shift+F5', true)).toBe('⇧F5');
    expect(chordLabel('Ctrl+Alt+Shift+3', true)).toBe('⌘⌥⇧3');
    expect(chordLabel('Ctrl+2', false)).toBe('Ctrl+2');
  });

  it('keeps good keys and drops bad ones', () => {
    expect(ownKeys({ F4: 'L', F8: 'L', F6: 'NOPE', a: 'L', 'Ctrl+2': 'CO', 'Shift+F10': 'L' })).toEqual({ F4: 'L', 'Ctrl+2': 'CO' });
    expect(ownKeys('x')).toEqual({});
  });

  it('says why a key cannot be added', () => {
    expect(keyProblem('F8', 'L', {})).toBe('F8 is the key of ORTHO. Choose another.');
    expect(keyProblem('F8', 'ORTHO', {})).toBe('F8 is already a key of ORTHO.');
    expect(keyProblem('F4', 'L', { F4: 'CO' })).toBe('F4 is the key of COPY. Choose another.');
    expect(keyProblem('F4', 'L', {})).toBeNull();
  });

  it('finds the command and the keys', () => {
    expect(commandOfKey('F8', {})).toBe(CAD_COMMANDS.find((c) => c.aliases.includes('ORTHO')));
    expect(commandOfKey('F4', { F4: 'CO' })).toBe(copy);
    expect(commandOfKey('F4', {})).toBeUndefined();
    const ortho = CAD_COMMANDS.find((c) => c.aliases.includes('ORTHO'))!;
    expect(keysOf(ortho, { F4: 'ORTHO' })).toEqual([{ chord: 'F8', own: false }, { chord: 'F4', own: true }]);
    expect(keysOf(copy, {})).toEqual([]);
  });

  it('filters the rows by description and name', () => {
    expect(commandRows('')).toHaveLength(CAD_COMMANDS.length);
    expect(commandRows('copy').map(commandId)).toContain('CO');
    expect(commandRows('ortho f8').map(commandId)).toEqual(['ORTHO']);
    expect(commandRows('zzzz')).toEqual([]);
  });
});
