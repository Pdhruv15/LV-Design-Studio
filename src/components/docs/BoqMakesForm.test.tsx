import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleProject } from '../../data/sampleProject';
import { newMakeList } from '../../model/boqMakes';
import BomView from './BomView';
import BoqMakesForm from './BoqMakesForm';

beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('BOQ approved makes dialog', () => {
  it('counts the categories with makes on the price list bar', () => {
    const makes = { ...newMakeList(), categories: { mccb: { makes: ['Make A'] } } };
    const html = renderToStaticMarkup(<BomView project={{ ...sampleProject, boq: { makes } }} results={[]} onChange={vi.fn()} onStatus={vi.fn()} />);
    expect(html).toMatch(/Makes &amp; preambles \(1 \/ \d+\)/);
  });

  it('lists the used categories with three makes, a spec reference and the line count', () => {
    const value = { ...newMakeList('Office'), categories: { mccb: { makes: ['Make A', 'Make B'], specRef: '26 28 16' } } };
    const html = renderToStaticMarkup(<BoqMakesForm value={value} used={{ mccb: 14, cable: 21 }} titles={{ B: 'Switchgear and protection', E: 'Cables' }} onSave={vi.fn()} onClose={vi.fn()} onStatus={vi.fn()} />);
    for (const label of ['Approved makes', 'Preambles', 'Load office list…', 'Save as office list', 'Print “or approved equal”', 'Remove from this BOQ']) expect(html).toContain(label);
    expect(html).toContain('aria-label="MCCB: make 3"');
    expect(html).toContain('value="Make B"');
    expect(html).toContain('value="26 28 16"');
    expect(html).toContain('B · Switchgear and protection');
    expect(html).not.toContain('ACB</td>'); // not used in this BOQ
  });
});
