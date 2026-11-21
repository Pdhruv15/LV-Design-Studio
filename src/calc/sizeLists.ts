import { catalog } from '../database/catalog';

/** The lists transformer and generator sizes are picked from: one definition for Load
 * assessment, Space plan and Tx & Gen sizing, so the same name means the same sizes. */

export type TxSizeList = 'dewa' | 'market' | 'catalogue';

/** DEWA's distribution transformer sizes (11 / 0.415 kV). */
export const DEWA_TX_KVA = [500, 1000, 1500];

/** Market standard sizes: the preferred ratings distribution transformers are made in
 * (100 to 3,150 kVA), with 1,500 kVA, a usual size with the Gulf utilities. */
export const MARKET_TX_KVA = [100, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1500, 1600, 2000, 2500, 3150];

export const TX_SIZE_LISTS: { value: TxSizeList; label: string }[] = [
  { value: 'dewa', label: 'DEWA — 500, 1,000, 1,500 kVA' },
  { value: 'market', label: 'Market standard — 100 to 3,150 kVA' },
  { value: 'catalogue', label: 'My catalogue' }
];

/** The sizes in the Transformers catalogue, smallest first. */
export const catalogueTxKva = (): number[] => [...new Set(catalog().transformers.map((t) => t.kva).filter((x) => x > 0))].sort((a, b) => a - b);

/** Every size of a list. The catalogue list is the market standard sizes while the catalogue is empty. */
export function txSizeList(kind: TxSizeList): number[] {
  if (kind === 'dewa') return DEWA_TX_KVA;
  const cat = kind === 'catalogue' ? catalogueTxKva() : [];
  return cat.length ? cat : MARKET_TX_KVA;
}

/** The lists to offer: the catalogue only when it has sizes, or when it is the one in use. */
export const txSizeChoices = (inUse?: TxSizeList) => TX_SIZE_LISTS.filter((l) => l.value !== 'catalogue' || inUse === 'catalogue' || catalogueTxKva().length > 0);

/** A list as a report names it: "next … size". */
export const txSizeListText = (kind: TxSizeList): string => (kind === 'dewa' ? 'DEWA standard size (500 / 1000 / 1500 kVA)' : kind === 'catalogue' ? 'size of the Transformers catalogue' : 'market standard size (100 to 3150 kVA)');

/** Standard generator set sizes. */
export const GENERATOR_KVA = [20, 30, 45, 60, 80, 100, 125, 150, 200, 250, 300, 350, 400, 500, 630, 750, 800, 1000, 1250, 1500, 2000, 2500];

/** Generator sizes to pick from: the Generators catalogue, else the standard sizes. */
export function generatorSizes(): number[] {
  const cat = [...new Set(catalog().generators.map((g) => g.kva).filter((x) => x > 0))].sort((a, b) => a - b);
  return cat.length ? cat : GENERATOR_KVA;
}
