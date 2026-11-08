import { describe, expect, it } from 'vitest';
import { CAD_COMMANDS, cadCommand, toolAlias } from './cadCommands';

// Every alias of the typed-command chain as it was before the registry, and what it started: a tool, or the page action.
const BEFORE: Record<string, string> = {
  OPEN: '!open', CLOSE: '!close', CLOSEALL: '!close', FIT: '!fit', ZE: '!fit', 'Z E': '!fit', 'ZOOM E': '!fit', 'ZOOM EXTENTS': '!fit',
  DI: 'dist', DIST: 'dist', DISTANCE: 'dist', AREA: 'area', AA: 'area', RA: 'room', ROOM: 'room', ROOMAREA: 'room',
  ROOMS: '!addRooms', ADDROOMS: '!addRooms', TR: 'trace', TRACE: 'trace', PN: 'name', NAME: 'name', LI: 'none', LIST: 'none',
  DEV: 'dev', DEVICE: 'dev', INSERT: 'dev', I: 'dev', M: 'move', MOVE: 'move', CO: 'copy', CP: 'copy', COPY: 'copy',
  RO: 'rotate', ROTATE: 'rotate', L: 'line', LINE: 'line', PL: 'pline', PLINE: 'pline', POLYLINE: 'pline',
  CT: 'tray', TRAY: 'tray', CABLETRAY: 'tray', CR: 'cable', ROUTE: 'cable', CABLEROUTE: 'cable', LR: 'link', LINK: 'link',
  SCHED: '!schedules', SCHEDULES: '!schedules', UPDATE: '!schedules', FILL: 'fill', FR: 'fill', LUX: 'lux', LIGHTROOM: 'lux',
  EM: 'em', EMERGENCY: 'em', SEL: '!select', SELECT: '!select', ARL: 'arl', ARRAYLINE: 'arl', MA: 'match', MATCH: 'match', MATCHPROP: 'match',
  TRIM: 'trim', TM: 'trim', EX: 'extend', EXTEND: 'extend', O: 'offset', OFFSET: 'offset', F: 'fillet', FILLET: 'fillet',
  CHA: 'chamfer', CHAMFER: 'chamfer', BR: 'break', BREAK: 'break', J: 'join', JOIN: 'join', X: 'explode', EXPLODE: 'explode',
  MI: 'mirror', MIRROR: 'mirror', SC: 'scale', SCALE: 'scale', S: 'stretch', STRETCH: 'stretch', AR: 'array', ARRAY: 'array',
  MP: 'matchprop', PAINTER: 'matchprop', H: 'hatch', HATCH: 'hatch', BH: 'hatch', LE: 'leader', LEADER: 'leader', QLEADER: 'leader',
  RT: 'rtag', ROOMTAG: 'rtag', NORTH: 'north',
  XR: '!xref', XREF: '!xref', XREFS: '!xref', ER: '!xref', EXTERNALREFERENCES: '!xref', XA: '!xattach', XATTACH: '!xattach',
  XCLIP: '!xclip', XC: '!xclip', LM: '!layerManager', LAYERMANAGER: '!layerManager', LAYMAN: '!layerManager',
  // Since the layer palette: LAYER opens it (as in current industrial 2D drafting products); LA still shows the Layers panel.
  LAYER: '!layerManager', 'LAYER N': '!newLayer', 'LAYER NEW': '!newLayer', '-LAYER N': '!newLayer', CLAYER: '!clayer', LAYISO: '!layiso', LAYUNISO: '!layuniso',
  ALIGN: '!align', ALIGNV: '!align', SPACE: '!align', WC: '!wireAll', WIRE: '!wireAll', WIRECIRCUITS: '!wireAll', W1: 'wire', WIREONE: 'wire',
  TAGS: '!wireTags', COV: '!coverage', COVERAGE: '!coverage', REC: 'rect', RECTANG: 'rect', RECTANGLE: 'rect',
  C: 'circle', CIRCLE: 'circle', A: 'arc', ARC: 'arc', T: 'text', DT: 'text', TEXT: 'text', MT: 'text',
  DIM: 'dim', DIMALIGNED: 'dim', DAL: 'dim', DLI: 'dim', E: '!erase', ERASE: '!erase', DEL: '!erase', DELETE: '!erase',
  SAVE: '!save', DXFOUT: '!save', SAVEAS: '!save', SAVEDWG: '!saveDwg', DWGOUT: '!saveDwg',
  LA: '!layers', LAYERS: '!layers', OS: '!osnap', OSNAP: '!osnap', GRID: '!grid', ORTHO: '!ortho', SNAP: '!snap',
  HELP: '!help', '?': '!help'
};
// Added since: the text and dimension styles (STYLE, DIMSTYLE).
const ADDED: Record<string, string> = { ST: '!textStyle', STYLE: '!textStyle', D: '!dimStyle', DST: '!dimStyle', DIMSTY: '!dimStyle', DIMSTYLE: '!dimStyle' };
const outcome = (c: string) => { const x = cadCommand(c); return x && ('tool' in x ? x.tool : `!${x.action}`); };

describe('Design CAD typed commands', () => {
  it('resolves every alias to the same tool or action as before, and no others', () => {
    for (const [c, was] of Object.entries({ ...BEFORE, ...ADDED })) expect(outcome(c), c).toBe(was);
    expect(CAD_COMMANDS.flatMap((x) => x.aliases).sort()).toEqual(Object.keys({ ...BEFORE, ...ADDED }).sort());
  });

  it('lists each alias once, upper case', () => {
    const all = CAD_COMMANDS.flatMap((x) => x.aliases);
    expect(new Set(all).size).toBe(all.length);
    for (const a of all) expect(a).toBe(a.toUpperCase());
  });

  it('is not a command for unknown or lower-case text', () => {
    expect(cadCommand('NOPE')).toBeUndefined();
    expect(cadCommand('line')).toBeUndefined();
  });

  it('shows the same alias beside each edit tool as before', () => {
    const shown = { trim: 'TRIM', extend: 'EX', offset: 'O', fillet: 'F', chamfer: 'CHA', break: 'BR', join: 'J', explode: 'X', mirror: 'MI', scale: 'SC', stretch: 'S', array: 'AR' } as const;
    for (const [tool, a] of Object.entries(shown)) expect(toolAlias(tool as keyof typeof shown), tool).toBe(a);
  });
});
