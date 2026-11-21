import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_CATALOG, setCatalog } from '../database/catalog';
import { assess, DEFAULT_TYPES, laSizeList, newAssessment } from './loadAssessment';
import { DEWA_TX_KVA, GENERATOR_KVA, generatorSizes, MARKET_TX_KVA, txSizeChoices, txSizeList, txSizeListText } from './sizeLists';
import { emptyPlan, planSizes } from './spacePlan';
import { sizesOf, TXGEN_DEFAULTS, txGenSizeList } from './txGen';

afterEach(() => setCatalog(EMPTY_CATALOG));
const catalogue = () => setCatalog({ ...EMPTY_CATALOG, transformers: [{ kva: 800 }, { kva: 500 }, { kva: 1250 }], generators: [{ kva: 500 }, { kva: 900 }] });

describe('one definition of the size lists', () => {
  it('the same name gives the same sizes on Space plan, Tx & Gen sizing and Load assessment', () => {
    expect(txSizeList('dewa')).toEqual([500, 1000, 1500]);
    expect(planSizes(emptyPlan().settings)).toEqual(DEWA_TX_KVA);
    expect(sizesOf(TXGEN_DEFAULTS)).toEqual(DEWA_TX_KVA);
    expect(sizesOf({ ...TXGEN_DEFAULTS, sizeList: 'market' })).toEqual(MARKET_TX_KVA);
    expect(planSizes({ ...emptyPlan().settings, sizeList: 'market', maxTransformerKva: 3150 })).toEqual(MARKET_TX_KVA);
    const a = newAssessment(DEFAULT_TYPES[0], {}, { types: [] });
    expect(assess({ ...a, supply: { ...a.supply, sizeList: 'market', maxTxKva: 3150 } }).txSizes).toEqual(MARKET_TX_KVA);
    expect(assess({ ...a, supply: { ...a.supply, sizeList: 'dewa' } }).txSizes).toEqual(DEWA_TX_KVA);
    // 16 market sizes, with both 200 and 1,500 kVA.
    expect(MARKET_TX_KVA).toHaveLength(16);
    expect(MARKET_TX_KVA).toEqual(expect.arrayContaining([200, 1500]));
  });

  it('the catalogue list reads the Transformers catalogue and is offered only when it has sizes', () => {
    expect(txSizeChoices().map((l) => l.value)).toEqual(['dewa', 'market']);
    expect(txSizeChoices('catalogue').map((l) => l.value)).toEqual(['dewa', 'market', 'catalogue']);
    expect(txSizeList('catalogue')).toEqual(MARKET_TX_KVA);
    catalogue();
    expect(txSizeChoices().map((l) => l.value)).toEqual(['dewa', 'market', 'catalogue']);
    expect(txSizeList('catalogue')).toEqual([500, 800, 1250]);
  });

  it('a load assessment with no list picked reads the catalogue, else the market standard sizes; a typed list wins', () => {
    const a = newAssessment(DEFAULT_TYPES[0], {}, { types: [] });
    expect(laSizeList(a.supply)).toBe('market');
    expect(assess(a).txSizes).toEqual(MARKET_TX_KVA);
    catalogue();
    expect(laSizeList(a.supply)).toBe('catalogue');
    expect(assess(a).txSizes).toEqual([500, 800, 1250]);
    expect(assess({ ...a, supply: { ...a.supply, txSizes: [1000, 2000], sizeList: 'dewa' } }).txSizes).toEqual([1000, 2000]);
  });

  it('the earlier "IEC" choice of Tx & Gen sizing reads as it behaved: the catalogue when it has sizes, else the market sizes', () => {
    expect(txGenSizeList({ ...TXGEN_DEFAULTS, sizeList: 'iec' })).toBe('market');
    catalogue();
    expect(txGenSizeList({ ...TXGEN_DEFAULTS, sizeList: 'iec' })).toBe('catalogue');
    expect(sizesOf({ ...TXGEN_DEFAULTS, sizeList: 'iec' })).toEqual([500, 800, 1250]);
    expect(txSizeListText('dewa')).toContain('DEWA');
    expect(txSizeListText('catalogue')).toContain('catalogue');
  });

  it('generators: the Generators catalogue, else the 22 standard sizes, for both pages', () => {
    expect(generatorSizes()).toEqual(GENERATOR_KVA);
    expect(GENERATOR_KVA).toHaveLength(22);
    const a = newAssessment(DEFAULT_TYPES[0], { gfaM2: 24000, floors: 20, parkingM2: 8000 }, { types: [] });
    // 794 kVA needed: 800 kVA from the standard sizes, 900 kVA from the catalogue.
    expect(assess(a).generatorKva).toBe(800);
    catalogue();
    expect(generatorSizes()).toEqual([500, 900]);
    expect(assess(a).generatorKva).toBe(900);
  });
});
