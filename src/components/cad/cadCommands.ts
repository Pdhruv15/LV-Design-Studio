import type { CadTool } from './cadState';

/** The Design CAD typed commands: each once, with its aliases (the first is the one shown beside a tool's panel), what it
 * does, and the tool it starts or the page action it runs. Typed input for the tool in use (a radius, an angle, a point,
 * the text of TEXT), O in AREA (object) and the layout commands are read before these, on the page. */

/** Commands that run something on the page rather than start a tool. */
export type CadAction = 'open' | 'close' | 'fit' | 'addRooms' | 'schedules' | 'select' | 'xref' | 'xattach' | 'xclip' | 'layerManager'
  | 'align' | 'wireAll' | 'wireTags' | 'coverage' | 'erase' | 'save' | 'saveDwg' | 'layers' | 'osnap' | 'grid' | 'ortho' | 'snap' | 'help'
  | 'textStyle' | 'dimStyle';

export type CadCommand = { aliases: readonly string[]; desc: string } & ({ tool: CadTool } | { action: CadAction });

export const CAD_COMMANDS: readonly CadCommand[] = [
  { aliases: ['OPEN'], desc: 'Open a drawing', action: 'open' },
  { aliases: ['CLOSE', 'CLOSEALL'], desc: 'Close the drawing, or all of them', action: 'close' },
  { aliases: ['FIT', 'ZE', 'Z E', 'ZOOM E', 'ZOOM EXTENTS'], desc: 'Zoom to the whole drawing', action: 'fit' },
  { aliases: ['DI', 'DIST', 'DISTANCE'], desc: 'Measure a distance', tool: 'dist' },
  { aliases: ['AREA', 'AA'], desc: 'Measure an area', tool: 'area' },
  { aliases: ['RA', 'ROOM', 'ROOMAREA'], desc: 'Room area: click inside a room', tool: 'room' },
  { aliases: ['ROOMS', 'ADDROOMS'], desc: 'Add the rooms found', action: 'addRooms' },
  { aliases: ['TR', 'TRACE'], desc: 'Trace a room', tool: 'trace' },
  { aliases: ['PN', 'NAME'], desc: 'Pick a room name', tool: 'name' },
  { aliases: ['LI', 'LIST'], desc: 'Inspect', tool: 'none' },
  { aliases: ['DEV', 'DEVICE', 'INSERT', 'I'], desc: 'Add a device', tool: 'dev' },
  { aliases: ['M', 'MOVE'], desc: 'Move', tool: 'move' },
  { aliases: ['CO', 'CP', 'COPY'], desc: 'Copy', tool: 'copy' },
  { aliases: ['RO', 'ROTATE'], desc: 'Rotate', tool: 'rotate' },
  { aliases: ['L', 'LINE'], desc: 'Line', tool: 'line' },
  { aliases: ['PL', 'PLINE', 'POLYLINE'], desc: 'Polyline', tool: 'pline' },
  { aliases: ['CT', 'TRAY', 'CABLETRAY'], desc: 'Cable tray run', tool: 'tray' },
  { aliases: ['CR', 'ROUTE', 'CABLEROUTE'], desc: 'Cable route', tool: 'cable' },
  { aliases: ['LR', 'LINK'], desc: 'Link a line as a cable route', tool: 'link' },
  { aliases: ['SCHED', 'SCHEDULES', 'UPDATE'], desc: 'Update schedules', action: 'schedules' },
  { aliases: ['FILL', 'FR'], desc: 'Fill a room with an ELV device', tool: 'fill' },
  { aliases: ['LUX', 'LIGHTROOM'], desc: 'Light a room by the lumen method', tool: 'lux' },
  { aliases: ['EM', 'EMERGENCY'], desc: 'Emergency lighting', tool: 'em' },
  { aliases: ['SEL', 'SELECT'], desc: 'Select devices', action: 'select' },
  { aliases: ['ARL', 'ARRAYLINE'], desc: 'Array on line', tool: 'arl' },
  { aliases: ['MA', 'MATCH', 'MATCHPROP'], desc: 'Match a device', tool: 'match' },
  { aliases: ['TRIM', 'TM'], desc: 'Trim', tool: 'trim' },
  { aliases: ['EX', 'EXTEND'], desc: 'Extend', tool: 'extend' },
  { aliases: ['O', 'OFFSET'], desc: 'Offset', tool: 'offset' },
  { aliases: ['F', 'FILLET'], desc: 'Fillet', tool: 'fillet' },
  { aliases: ['CHA', 'CHAMFER'], desc: 'Chamfer', tool: 'chamfer' },
  { aliases: ['BR', 'BREAK'], desc: 'Break', tool: 'break' },
  { aliases: ['J', 'JOIN'], desc: 'Join', tool: 'join' },
  { aliases: ['X', 'EXPLODE'], desc: 'Explode', tool: 'explode' },
  { aliases: ['MI', 'MIRROR'], desc: 'Mirror', tool: 'mirror' },
  { aliases: ['SC', 'SCALE'], desc: 'Scale', tool: 'scale' },
  { aliases: ['S', 'STRETCH'], desc: 'Stretch', tool: 'stretch' },
  { aliases: ['AR', 'ARRAY'], desc: 'Array', tool: 'array' },
  // MATCHPROP goes to Match above (it always has); MP and PAINTER match the properties of drawn objects.
  { aliases: ['MP', 'PAINTER'], desc: 'Match properties', tool: 'matchprop' },
  { aliases: ['H', 'HATCH', 'BH'], desc: 'Hatch', tool: 'hatch' },
  { aliases: ['LE', 'LEADER', 'QLEADER'], desc: 'Leader', tool: 'leader' },
  { aliases: ['RT', 'ROOMTAG'], desc: 'Room tag', tool: 'rtag' },
  { aliases: ['NORTH'], desc: 'North arrow', tool: 'north' },
  { aliases: ['XR', 'XREF', 'XREFS', 'ER', 'EXTERNALREFERENCES'], desc: 'References', action: 'xref' },
  { aliases: ['XA', 'XATTACH'], desc: 'Attach a reference', action: 'xattach' },
  { aliases: ['XCLIP', 'XC'], desc: 'Clip a reference', action: 'xclip' },
  { aliases: ['LM', 'LAYERMANAGER', 'LAYMAN'], desc: 'Layer manager', action: 'layerManager' },
  { aliases: ['ALIGN', 'ALIGNV', 'SPACE'], desc: 'Align or space the devices selected', action: 'align' },
  { aliases: ['WC', 'WIRE', 'WIRECIRCUITS'], desc: 'Wire circuits', action: 'wireAll' },
  { aliases: ['W1', 'WIREONE'], desc: 'Wire one', tool: 'wire' },
  { aliases: ['TAGS'], desc: 'Wire tags on or off', action: 'wireTags' },
  { aliases: ['COV', 'COVERAGE'], desc: 'Coverage on or off', action: 'coverage' },
  { aliases: ['REC', 'RECTANG', 'RECTANGLE'], desc: 'Rectangle', tool: 'rect' },
  { aliases: ['C', 'CIRCLE'], desc: 'Circle', tool: 'circle' },
  { aliases: ['A', 'ARC'], desc: 'Arc, 3 points', tool: 'arc' },
  { aliases: ['T', 'DT', 'TEXT', 'MT'], desc: 'Text', tool: 'text' },
  { aliases: ['DIM', 'DIMALIGNED', 'DAL', 'DLI'], desc: 'Aligned dimension', tool: 'dim' },
  { aliases: ['ST', 'STYLE'], desc: 'Text style', action: 'textStyle' },
  { aliases: ['D', 'DST', 'DIMSTY', 'DIMSTYLE'], desc: 'Dimension style', action: 'dimStyle' },
  { aliases: ['E', 'ERASE', 'DEL', 'DELETE'], desc: 'Erase', action: 'erase' },
  { aliases: ['SAVE', 'DXFOUT', 'SAVEAS'], desc: 'Save as DXF', action: 'save' },
  { aliases: ['SAVEDWG', 'DWGOUT'], desc: 'Save as DWG', action: 'saveDwg' },
  { aliases: ['LA', 'LAYER', 'LAYERS'], desc: 'Layers on or off', action: 'layers' },
  { aliases: ['OS', 'OSNAP'], desc: 'Object snap (F3)', action: 'osnap' },
  { aliases: ['GRID'], desc: 'Grid (F7)', action: 'grid' },
  { aliases: ['ORTHO'], desc: 'Ortho (F8)', action: 'ortho' },
  { aliases: ['SNAP'], desc: 'Snap (F9)', action: 'snap' },
  { aliases: ['HELP', '?'], desc: 'The command list', action: 'help' }
];

const BY_ALIAS = new Map(CAD_COMMANDS.flatMap((x) => x.aliases.map((a) => [a, x] as const)));

/** The command typed (upper case, single spaces), if it is one. */
export const cadCommand = (c: string): CadCommand | undefined => BY_ALIAS.get(c);

/** The alias shown for a tool, e.g. EX for Extend. */
export const toolAlias = (tool: CadTool): string | undefined => CAD_COMMANDS.find((x) => 'tool' in x && x.tool === tool)?.aliases[0];
