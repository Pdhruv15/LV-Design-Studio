import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The paper view sizes its canvas from its own box; its stage (.cad-stage) is not a flex box, so a flex: 1 view had no
// height and the layout showed blank. It has to fill the stage by position.
describe('file layout paper view', () => {
  it('fills its stage', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    const rule = css.match(/^\.cad-filepaper\{([^}]*)\}/m)?.[1] ?? '';
    expect(rule).toContain('position:absolute');
    expect(rule).toContain('inset:0');
    expect(css).toMatch(/^\.cad-stage\{[^}]*position:relative/m);
  });
});
