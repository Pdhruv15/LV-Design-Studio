import { describe, expect, it } from 'vitest';
import { ELV_PALETTE as fromCad } from './elvCadDevices';
import { coverageSystems, ELV_PALETTE, fillChoices } from './elvLabels';

describe('ELV labels for the ribbon', () => {
  it('offers Fill room the palette devices that have a spacing', () => {
    expect(fillChoices().map((c) => [c.label, c.spacingM.toFixed(1)])).toEqual([['Smoke detector', '10.6'], ['Heat detector', '7.5'], ['Wi-Fi access point', '17.0'], ['Ceiling speaker', '6.0']]);
  });
  it('offers Coverage the systems that have a device covering an area, a distance or a view', () => {
    expect(coverageSystems().map((s) => s.id)).toEqual(['fire-alarm', 'cctv', 'ict', 'public-address']);
  });
  it('keeps one palette for the ribbon and the placement', () => { expect(fromCad).toBe(ELV_PALETTE); });
});
