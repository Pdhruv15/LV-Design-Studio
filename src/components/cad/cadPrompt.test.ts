import { describe, expect, it } from 'vitest';
import { commandList, matchingCommands, optionKey, promptOptions, promptParts, shortPrompt, spaceEnters } from './cadPrompt';
import { CAD_COMMANDS } from './cadCommands';

describe('command line prompts', () => {
  it('takes the capital letters of an option as its key', () => {
    expect(['Through', 'Erase', 'Layer', 'eXit', 'Yes', 'No', 'Object'].map(optionKey)).toEqual(['T', 'E', 'L', 'X', 'Y', 'N', 'O']);
    expect(optionKey('polar')).toBe('P');
  });

  it('cuts a prompt into its text and options, keeping the text as written', () => {
    const line = 'OFFSET  Specify offset distance or [Through/Erase/Layer] <0.30>:';
    const parts = promptParts(line);
    expect(parts.map((p) => ('option' in p ? p.option : p.text)).join('')).toBe(line);
    expect(promptOptions(line)).toEqual([{ option: 'Through', key: 'T' }, { option: 'Erase', key: 'E' }, { option: 'Layer', key: 'L' }]);
    expect(promptParts('LINE  Specify first point:')).toEqual([{ text: 'LINE  Specify first point:' }]);
    expect(promptOptions('Command: MIRROR  Erase source objects? [Yes/No] <No>:').map((o) => o.key)).toEqual(['Y', 'N']);
  });

  it('lists the commands matching what is typed, the alias typed first', () => {
    expect(matchingCommands('OF')[0]).toMatchObject({ alias: 'OFFSET' });
    expect(matchingCommands('O')[0].alias).toBe('O');
    expect(matchingCommands('O').map((x) => x.alias)).toContain('OPEN');
    expect(matchingCommands('0.5')).toEqual([]);
    expect(matchingCommands('@1,2')).toEqual([]);
    expect(matchingCommands('ZZZ')).toEqual([]);
  });

  it('lets Space end the input, except in a command of several words or one taking a value', () => {
    expect(spaceEnters('')).toBe(true);
    expect(spaceEnters('OFFSET')).toBe(true);
    expect(spaceEnters('0.5')).toBe(true);
    expect(spaceEnters('ZOOM')).toBe(false);
    expect(spaceEnters('Z')).toBe(false);
    expect(spaceEnters('VPSCALE')).toBe(false);
    expect(spaceEnters('ZOOM E')).toBe(false);
  });

  it('has every command once in the F1 list', () => {
    expect(commandList()).toHaveLength(CAD_COMMANDS.length);
    expect(commandList().find((c) => c.aliases.startsWith('O ·'))).toEqual({ aliases: 'O · OFFSET', desc: 'Offset' });
  });

  it('shortens a prompt for the box at the cursor', () => {
    expect(shortPrompt('Command: OFFSET  Specify offset distance or [Through/Erase/Layer] <0.30>:')).toBe('Specify offset distance');
    expect(shortPrompt('TEXT  Specify height <2.5 mm>:')).toBe('Specify height');
    expect(shortPrompt('PLINE  Specify next point or [Close], Enter to finish:')).toBe('Specify next point');
    expect(shortPrompt('LINE  Specify next point or Enter to stop:')).toBe('Specify next point or Enter to stop');
  });
});
