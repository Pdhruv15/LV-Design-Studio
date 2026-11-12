import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DiagramResultsBar from './DiagramResultsBar';
import type { SupplyMode } from '../calc/scenario';

const noop = () => {};
const render = (supply: SupplyMode = 'normal', stale = 0, fails = 0) => renderToStaticMarkup(
  <DiagramResultsBar source="builtin" onSource={noop} onRun={noop} running={false} supply={supply} onSupply={noop} calc={{ stale, fails, onRun: noop }} />
);

describe('the bar above the SLD', () => {
  it('shows the state of the results; what the drawing shows is chosen on the ribbon', () => {
    const html = render();
    expect(html).toContain('Calculated');
    expect(html).toContain('Results: built-in');
    for (const gone of ['Show on the drawing', 'Colour by', 'Normal supply']) expect(html, gone).not.toContain(gone);
    expect(html).not.toContain('supply-pick');
  });

  it('names a scenario other than the normal one, with the way back', () => {
    expect(render('generator')).toContain('aria-label="On generator — back to normal supply"');
    expect(render('outage:MDB-2')).toContain('aria-label="Transformer of MDB-2 failed — back to normal supply"');
  });

  it('says when the studies are out of date or checks fail', () => {
    expect(render('normal', 2)).toContain('Out of date · Run');
    expect(render('normal', 0, 3)).toContain('3 failing');
  });
});
