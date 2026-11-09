import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { drawnTitleBlockDxf, templateTitleBlockDxf } from './titleBlockDxf';
import { toDxf, type DxfPrimitive } from './dxf';
import type { TitleTemplate } from '../model/titleBlock';

/** A drawn (imported) title block goes to DXF as a block with attributes: the geometry and fixed texts in the block,
 * the fields as ATTDEFs, the sheet's values as ATTRIBs of the INSERT. */
const drawn: TitleTemplate = {
  id: 'tb-d', name: 'ACME block', kind: 'drawn', cols: [], rows: [], cells: [], size: { w: 180, h: 44 },
  shapes: [{ kind: 'line', x1: 0, y1: 0, x2: 180, y2: 0 }, { kind: 'circle', cx: 10, cy: 10, r: 4 }],
  texts: [{ id: 't1', x: 5, y: 40, h: 2.5, text: 'ACME CONSULTANTS' }, { id: 't2', x: 100, y: 40, h: 3.5, text: '{SheetNo}', tag: 'DWG_NO', orig: 'E-000', align: 'right' }, { id: 't3', x: 150, y: 20, h: 2.5, text: '{Rev}' }]
};

describe('drawn title block in DXF', () => {
  it('is one INSERT at the box\'s corner, its block holding the lines, the fixed text and the attribute definitions', () => {
    const r = drawnTitleBlockDxf(drawn, sampleProject, { x: 230, y: 10, w: 180, h: 44 }, { SheetNo: 'E-SLD-001', Rev: 'B' });
    expect(r.items).toHaveLength(1);
    const ins = r.items[0];
    if (ins.type !== 'insert') throw new Error('not an insert');
    expect(ins.name).toBe('TB_ACME_BLOCK');
    expect(ins.x).toBe(230); expect(ins.y).toBe(10); expect(ins.scale).toBe(1);
    expect(ins.block.items.map((i) => i.type)).toEqual(['line', 'circle', 'text']);
    expect(ins.block.items[0]).toMatchObject({ x1: 0, y1: 44, x2: 180, y2: 44 }); // y up in the block
    expect(ins.block.attdefs.map((a) => a.tag)).toEqual(['DWG_NO', 'REV']);
    expect(ins.attribs.map((a) => [a.tag, a.value])).toEqual([['DWG_NO', 'E-SLD-001'], ['REV', 'B']]);
    expect(ins.attribs[0]).toMatchObject({ x: 330, y: 14, align: 'right' }); // 230 + 100, 10 + (44 − 40)
    expect(ins.extent).toEqual([[230, 10], [410, 54]]);
    expect(templateTitleBlockDxf(drawn, sampleProject, { x: 230, y: 10, w: 180, h: 44 }, {}, []).items[0].type).toBe('insert');
  });
  it('writes a BLOCKS section with the block and its ATTDEFs, and the INSERT with its ATTRIBs and a SEQEND', () => {
    const items: DxfPrimitive[] = drawnTitleBlockDxf(drawn, sampleProject, { x: 230, y: 10, w: 180, h: 44 }, { SheetNo: 'E-SLD-001', Rev: 'B' }).items;
    const dxf = toDxf(items, { 'E-TITLE': 7 });
    const lines = dxf.split('\r\n');
    const after = (code: string, value: string) => { const i = lines.findIndex((l, k) => l === code && lines[k + 1] === value); return i; };
    expect(after('2', 'BLOCKS')).toBeGreaterThan(0);
    expect(after('0', 'BLOCK')).toBeGreaterThan(after('2', 'BLOCKS'));
    expect(after('0', 'ATTDEF')).toBeGreaterThan(after('0', 'BLOCK'));
    expect(after('0', 'ENDBLK')).toBeGreaterThan(after('0', 'ATTDEF'));
    expect(after('0', 'INSERT')).toBeGreaterThan(after('2', 'ENTITIES'));
    expect(after('0', 'ATTRIB')).toBeGreaterThan(after('0', 'INSERT'));
    expect(after('0', 'SEQEND')).toBeGreaterThan(after('0', 'ATTRIB'));
    expect(dxf).toContain('\r\n2\r\nTB_ACME_BLOCK\r\n');
    expect(dxf).toContain('\r\n1\r\nE-SLD-001\r\n');
    expect(dxf).toContain('\r\n1\r\nACME CONSULTANTS\r\n');
    expect(dxf).toMatch(/\$EXTMAX\r\n10\r\n410/); // the insert's extent counts in the drawing's extents
  });
});
