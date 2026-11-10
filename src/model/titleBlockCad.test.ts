import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { drawnFromSketch, gridToDrawn, isTbFile, openTitleBlockInCad, saveTitleBlockFromCad, TB_FRAME, TB_LAYERS, tbDrawingDxf, tbFile, tbIdOf, tbSketchItems } from './titleBlockCad';
import { standardTemplate, templateSize, type TitleTemplate } from './titleBlock';
import { sketchOf } from './cadSketch';
import type { SketchItem } from '../types';

/** A title block edited in Design CAD: the template as drawn objects at 1 : 1 mm in an A3 frame, and back. */
const drawn: TitleTemplate = {
  id: 'tb-d', name: 'ACME', kind: 'drawn', cols: [], rows: [], cells: [], size: { w: 180, h: 44 },
  shapes: [{ kind: 'line', x1: 0, y1: 0, x2: 180, y2: 0, w: 0.5 }, { kind: 'line', x1: 0, y1: 44, x2: 180, y2: 44, w: 0.5 }, { kind: 'line', x1: 0, y1: 20, x2: 180, y2: 20 }, { kind: 'circle', cx: 10, cy: 10, r: 4 }],
  texts: [{ id: 't1', x: 5, y: 40, h: 2.5, text: 'ACME CONSULTANTS' }, { id: 't2', x: 100, y: 40, h: 3.5, text: '{SheetNo}', tag: 'DWG_NO', align: 'right' }]
};

describe('title block in Design CAD', () => {
  it('names the drawing after the template and knows it again', () => {
    expect(tbFile(drawn)).toBe('Title block tb-d.dxf');
    expect(tbIdOf('Title block tb-d.dxf')).toBe('tb-d');
    expect(isTbFile('plan.dwg')).toBe(false);
    expect(tbDrawingDxf()).toMatch(/\$INSUNITS\r\n70\r\n4/);
    expect(tbDrawingDxf()).toContain('TB-REF');
  });

  it('places the block in the frame\'s corner as drawn objects: the outline on TB-FRAME, fields on TB-FIELD, y up', () => {
    const items = tbSketchItems(drawn, 7);
    expect(items.map((it) => it.id)).toEqual(['S7', 'S8', 'S9', 'S10', 'S11', 'S12']);
    expect(items[0]).toMatchObject({ kind: 'line', layer: TB_LAYERS.frame, pts: [[TB_FRAME.w - 180, 44], [TB_FRAME.w, 44]], lw: 0.5 }); // the top edge (y = 0 in the template) at y = 44
    expect(items[1]).toMatchObject({ layer: TB_LAYERS.frame, pts: [[210, 0], [390, 0]] }); // the bottom edge
    expect(items[2]).toMatchObject({ layer: TB_LAYERS.grid, pts: [[210, 24], [390, 24]] });
    expect(items[3]).toMatchObject({ kind: 'circle', pts: [[220, 34]], r: 4 });
    expect(items[4]).toMatchObject({ kind: 'text', layer: TB_LAYERS.text, text: 'ACME CONSULTANTS', h: 2.5, just: 'L', pts: [[215, 4]] });
    expect(items[5]).toMatchObject({ layer: TB_LAYERS.field, text: '{SheetNo}', just: 'R' });
  });

  it('opens a drawn template with its objects and TB layers seeded, and a grid template as a drawn copy', () => {
    const r = openTitleBlockInCad(sampleProject, drawn);
    expect(r.file).toBe('Title block tb-d.dxf');
    expect(sketchOf(r.project, r.file)).toHaveLength(6);
    expect(r.project.cadLayerStyle?.[r.file.toLowerCase()]).toMatchObject({ [TB_LAYERS.frame]: { lw: 0.5 }, [TB_LAYERS.grid]: { lw: 0.25 } });
    expect(r.project.cadLayerFile?.[r.file.toLowerCase()]?.current).toBe(TB_LAYERS.grid);
    const g = openTitleBlockInCad(sampleProject, standardTemplate());
    expect(g.template.kind).toBe('drawn');
    expect(g.template.name).toBe('Standard (180 mm) (CAD)');
    expect(g.project.titleTemplates?.some((t) => t.id === g.template.id)).toBe(true);
    expect(templateSize(g.template)).toEqual({ w: 180, h: 58 });
    expect(sketchOf(g.project, g.file).length).toBeGreaterThan(20);
  });

  it('a grid template becomes lines (each edge once) and texts; a logo cell the word LOGO; captions small', () => {
    const t = gridToDrawn(standardTemplate());
    const lines = t.shapes!.filter((s) => s.kind === 'line');
    const keys = new Set(lines.map((s) => JSON.stringify(s)));
    expect(keys.size).toBe(lines.length); // no edge twice
    expect(t.texts!.some((x) => x.text === 'LOGO')).toBe(true);
    expect(t.texts!.find((x) => x.text === 'COMPANY / CONSULTANT')).toMatchObject({ h: 1.4 });
    expect(t.texts!.find((x) => x.text === '{Company}')).toMatchObject({ h: +(9 * 0.254).toFixed(2) });
    expect(t.texts!.find((x) => x.text === '{DrawingNo}')!.fit).toBeGreaterThan(30);
  });

  it('the drawn objects come back as the template: size from their extents, arcs as polylines, fields with their tags', () => {
    const items: SketchItem[] = [
      ...tbSketchItems(drawn),
      { id: 'S20', kind: 'arc', layer: TB_LAYERS.grid, pts: [[300, 10]], r: 5, a0: 0, a1: Math.PI },
      { id: 'S21', kind: 'text', layer: 'LV-ANNO', pts: [[300, 30]], text: '{Rev}', h: 3, just: 'MC', rot: Math.PI / 2 }
    ];
    const back = drawnFromSketch(items, drawn);
    expect(back.size).toEqual({ w: 180, h: 44 });
    expect(back.shapes![0]).toMatchObject({ kind: 'line', x1: 0, y1: 0, x2: 180, y2: 0, w: 0.5 });
    expect(back.shapes!.find((s) => s.kind === 'poly')!.pts.length).toBeGreaterThan(8);
    expect(back.texts!.find((x) => x.text === '{SheetNo}')).toMatchObject({ tag: 'DWG_NO', align: 'right', x: 100, y: 40 });
    expect(back.texts!.find((x) => x.text === '{Rev}')).toMatchObject({ align: 'center', rot: 90, x: 90, y: 14 });
    expect(back.texts!.find((x) => x.text === 'ACME CONSULTANTS')!.fit).toBeUndefined();
  });

  it('saves the drawing into its template and says what it saved; refuses another drawing', () => {
    const r = openTitleBlockInCad(sampleProject, drawn);
    const s = saveTitleBlockFromCad({ ...r.project, titleTemplates: [drawn] }, r.file);
    expect(s.message).toMatch(/saved: 180 × 44 mm, 4 lines and shapes, 1 field/);
    expect(s.project.titleTemplates![0].texts).toHaveLength(2);
    const no = saveTitleBlockFromCad(sampleProject, 'plan.dwg');
    expect(no.project).toBe(sampleProject);
    expect(no.message).toMatch(/not a title block/);
  });
});
