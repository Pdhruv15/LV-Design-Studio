// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FurnitureFields } from './FurnitureFields';

/** The sheet furniture controls: for the set a blank choice is today's output; for a sheet it follows the set. */
describe('FurnitureFields', () => {
  it('for the set, the blank choices name today\'s output', () => {
    const html = renderToStaticMarkup(<FurnitureFields value={{}} onChange={() => {}} />);
    expect(html).toContain('Zone references');
    expect(html).toContain('<option value="" selected="">Off</option>');
    expect(html).toContain('<option value="" selected="">2.5 mm</option>');
    expect(html).toContain('1.8 mm (as before)');
    expect(html).not.toContain('As the set');
  });
  it('for a sheet, the blank choices name the set\'s values', () => {
    const html = renderToStaticMarkup(<FurnitureFields value={{ centring: true }} base={{ zones: 'large', textMm: 3.5 }} onChange={() => {}} />);
    expect(html).toContain('As the set (A2 and A1)');
    expect(html).toContain('As the set (3.5 mm)');
    expect(html).toContain('<option value="on" selected="">Print</option>');
  });
});
