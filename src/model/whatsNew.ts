/** What each release added, in plain words, for the What's new window shown once after an update (and from Help).
 * Add the new version at the top of RELEASES with each release batch, one line per feature. */
import { SEEN_KEY } from './whatsNewSeen';

export { markSeen } from './whatsNewSeen';

export type WhatsNewAction = 'cad' | 'sheets' | 'floor-plan' | 'floor-plan-lengths' | 'floor-plan-trays' | 'floor-plan-boards';

export interface WhatsNewItem {
  title: string;
  text: string;
  /** What the item's button opens; no button without one. */
  action?: WhatsNewAction;
  actionLabel?: string;
}

export interface Release { version: string; date: string; items: WhatsNewItem[] }

export const RELEASES: Release[] = [
  {
    version: '2.297', date: '2026-11-25',
    items: [
      { title: 'Design CAD: Quick dimension', text: 'Annotate → Dimensions → Quick (QDIM): pick lines, polylines, arcs and circles, drawn or of the opened drawing (a window too), press Enter, then click where the row goes. It draws one dimension between each pair of points in one go: horizontal above or below them, vertical beside them. Type C or B first for Continuous (a chain) or Baseline (each from the first); the choice is kept.', action: 'cad' },
      { title: 'Dimensions: Adjust space', text: 'Adjust space (DIMSPACE, beside the style list): click the base dimension, then the ones to space, Enter, then the gap in metres. Enter alone spaces them twice the text apart; 0 lines them up with the base. Dimensions in one chain stay in one row. Update has moved beside the layer list.', action: 'cad' }
    ]
  },
  {
    version: '2.296', date: '2026-11-25',
    items: [
      { title: 'No earth pits for a board fed from outside', text: 'A first board that is fed from a board outside the project no longer gets earth pits, a main earth terminal or pit lines in the earthing layout, the SLD and the BOQ, because its earth is at the board that feeds it. Tick Earth pit detail on the board to add them.' },
      { title: 'Spare RMUs are priced', text: 'An RMU that no board uses yet is now in the BOQ as a ring main unit of its type, with no transformer or cable lines for it.' }
    ]
  },
  {
    version: '2.295', date: '2026-11-25',
    items: [
      { title: 'Default texts no longer name one supply authority', text: 'Hints, placeholders, default report and drawing notes, the BOQ inspection line and similar texts now say "utility" or "authority" instead of one authority\'s name. Type the real name where you want it. Authority rule sets and forms keep their own names.' }
    ]
  },
  {
    version: '2.294', date: '2026-11-25',
    items: [
      { title: 'Forms: calculated source fault level', text: 'The TCL summary and the maximum-demand form now print the fault level calculated from a generator or inverter source rating when none is typed, marked "(calc.)", with its basis in the remarks of the incomer line of the maximum-demand form.' }
    ]
  },
  {
    version: '2.291', date: '2026-11-25',
    items: [
      { title: 'Add device: the circuit list shows the room left', text: 'In the Add device panel the Circuit field now opens a list: the boards of this level first, each circuit with its points against the most the Rules sheet allows ("7 / 10"), full circuits marked, and a Find box. Lighting points and 13 A sockets have a limit; other circuits show their points.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'A full circuit offers the next one', text: 'Placing a light or a 13 A socket now says how full its circuit is ("7 of 10 on the circuit"). When the circuit is full, the command line names the next circuit with room: press Tab to go on with it, or pick another. It is a warning, not a stop.' }
    ]
  },
  {
    version: '2.289', date: '2026-11-25',
    items: [
      { title: 'Compare a reference with its new revision', text: 'In Design CAD, right-click a reference drawing and choose Compare with new revision… (or type XCOMPARE), then pick the new file from the architect. The two are compared where the reference sits: lines added in the new revision show in green, lines taken out in red, and the command line says how many and in how many areas. Next zooms to each area in turn, Clouds draws a revision cloud round every area, Accept switches the reference to the new file, and Exit (or Esc) leaves it as it was.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.288', date: '2026-11-25',
    items: [
      { title: 'Load schedule: AFDD + RCBO', text: 'ELCB / RCD → AFDD + RCBO gives a 1-phase circuit an RCBO with arc fault detection (IEC 62606) in place of its MCB. It prints "+ AFDD" after the RCBO and has its own BOQ line and enclosure device.' },
      { title: 'Load schedule: MCB + RCD add-on block', text: 'ELCB / RCD → MCB + RCD add-on block keeps the circuit\'s MCB and clips an RCD block to it, for ratings or curves with no RCBO. It shows as RCD-1, 2 … and the BOQ and enclosure count the MCB and the block.' }
    ]
  },
  {
    version: '2.287', date: '2026-11-24',
    items: [
      { title: 'Load schedule: 4P RCBO for a 3-phase circuit', text: 'Select a 3-phase circuit and choose ELCB / RCD → RCBO for it: one 4P RCBO in place of its MCB, so it leaves the ELCB of its ways. It prints 4P and is counted TP+N in the BOQ.' },
      { title: 'Load schedule: No RCD for one circuit', text: 'ELCB / RCD → No RCD… takes a circuit off its ELCB on purpose (for example a fire alarm panel) and asks why. The reason prints in the ELCB column, no earth leakage device is counted, and the earth fault check rests on the MCB alone. Put back on its ELCB undoes it.' }
    ]
  },
  {
    version: '2.286', date: '2026-11-24',
    items: [
      { title: 'Short circuit report in per unit', text: 'The short circuit study report has two new tables. Impedance data in per unit lists every source, transformer and cable between boards with its R, X and Z on a common base power, and how each was worked. Fault at the busbars in per unit gives the path impedance, X/R, Ik″ and the peak current ip at every board. The currents are the same as before: per unit is another way of writing the same calculation. The base power is 100 MVA; change it in Project settings → Sizing targets → Per-unit base power.' }
    ]
  },
  {
    version: '2.285', date: '2026-11-24',
    items: [
      { title: 'Generator: minimum fault current from X′d', text: 'A board on a generator source has two new values beside X″d: X′d (25 % when not typed) and Sustained fault (× rated). The earth fault loop study now takes the generator\'s minimum fault current from X′d, or from the sustained current when you type it, in place of the sub-transient level. Breaking capacity still uses X″d. A pass that rests on the assumed 25 % shows as not verified until you type X′d, the sustained current or the minimum fault level. Earth loop results of projects on a generator source change: the fault current is lower than before.' }
    ]
  },
  {
    version: '2.284', date: '2026-11-24',
    items: [
      { title: 'Load schedule: Make RCBO for the one odd circuit', text: 'When one power circuit sits on a lighting ELCB (or one lighting circuit on a power ELCB), its Check cell offers Make RCBO: the circuit gets an RCBO in place of its MCB and the ELCB keeps one kind, e.g. 100 mA for lighting.' },
      { title: 'New ELCBs keep lighting and power apart', text: 'Once you change an ELCB on a DB, the ELCBs for new ways end where lighting and power circuits meet, so they never mix them. Re-group all ELCBs… turns this on or off with "Keep lighting and power circuits apart".' }
    ]
  },
  {
    version: '2.281', date: '2026-11-24',
    items: [
      { title: 'Cable data by type', text: 'Project settings has a new switch, Cable data by type (on in new projects, off in older ones). With it on, each cable is calculated with the data of its own type: copper or aluminium, XLPE or PVC, single-core or multicore. Voltage drop, fault levels, the earth loop and the cable rating all follow. The cable type list has three new types: Cu/XLPE single-core laid flat, Al/XLPE/SWA/PVC and Al/XLPE single-core. Cables.xlsx has three new columns in front (Conductor, Insulation, Form); left blank a row is copper / XLPE / multicore as before. The app has the resistance and reactance of the new families, but not their current ratings: add those rows from your datasheet, or the circuit shows DATA REQUIRED.' }
    ]
  },
  {
    version: '2.280', date: '2026-11-24',
    items: [
      { title: 'Options: what the mouse does in Design CAD', text: 'Options (OP) → General → Mouse: a right-click in the drawing can repeat the last command, as Space does, in place of opening the menu (Shift + right-click then opens it, and a click on an object still opens its menu). The wheel\'s zoom step can be set from 5 to 50 % (15 % as before), and its direction reversed. Both apply in a layout too, where a notch was 20 % before.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Options: what a new layout starts with', text: 'Options (OP) → Plot & publish → A new layout starts with: choose the paper and whether it is landscape or portrait, in place of always A3 landscape, and whether Page setup opens as soon as the layout is made.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.279', date: '2026-11-24',
    items: [
      { title: 'Options: your settings in one file', text: 'Design CAD → Options (OP) → General → Your settings: Export… writes one file with the options, your typed names and keys, the ribbon\'s panel order and the libraries of this computer (layer templates, layout templates, page setups with their pen tables, hatch patterns). Import… on another computer reads it: the amber dots show what it changes, OK keeps it and Cancel leaves everything as it was. Reset all puts every setting back to its default.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.278', date: '2026-11-24',
    items: [
      { title: 'Options: typed names and keys of your own', text: 'Design CAD → Options (OP) → Shortcuts & aliases lists every command. On Typed names, + adds a name of your own to a command, for example DUP for Copy; on Keys, + then a key press gives it a key: F1 to F12 alone or with Ctrl, Alt or Shift, or Ctrl with a digit. The standard names and keys stay. One already in use is refused, and the command that has it is named.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: DYN and HISTORY can be typed', text: 'DYN turns dynamic input on or off, as F12 does, and HISTORY opens the command history, as F2 does.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.277', date: '2026-11-24',
    items: [
      { title: 'Options: a preview on Display and Selection', text: 'Design CAD → Options (OP) → Display and Selection now show a small preview beside the settings: the crosshair and pick box at their real size and colour, line widths, the look of a picked object, its grips, the highlight under the pick box and the selection window. It follows each value as you change it, before OK.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.276', date: '2026-11-23',
    items: [
      { title: 'Design CAD: one Options window', text: 'Type OP (or right-click → Options…) for every Design CAD setting in one window: General, Files & saving, Display, Drafting, Selection, Plot & publish and This drawing. Drafting settings (DS) is now its Drafting page, with Snap & grid, Polar tracking, Object snap and Dynamic input as tabs; the Cursor settings are on Display and Object snap, and Saving is on Files & saving. Colour theme, palette, the ribbon\'s tool names, the folders and the printer can be set here too. Nothing changes its meaning or its default.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Options: find a setting, and see what you changed', text: 'Options opens with the cursor in "Find a setting": type a few letters and every matching setting shows, ready to change (Ctrl+F comes back to the box, Esc closes the window). An amber dot marks a setting that is not at its default, a number beside each page counts them, and "Changed" lists them all. The arrow beside a changed setting puts it back; Reset page does the same for the page.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.275', date: '2026-11-23',
    items: [
      { title: 'Design CAD: Devices and Level panels, every tool named', text: 'On Electrical, ELV & sheets the Devices panel now shows the name of each of its tools: Add device, Fill room, Light room, Room devices and Emergency. Coverage and Copy to level moved beside it to a new Level panel, for the tools that act on the whole level. A greyed tool of these panels says why in its tooltip.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Add device: every device on its arrow', text: 'The arrow beside Add device shows every device with its plan symbol, a Find box and the six devices placed last on this computer. Click one to place it. The list in the side panel stays as it was.' },
      { title: 'Fill room and Coverage keep their own choice', text: 'The arrow beside Fill room chooses the ELV device it fills with (smoke detector, heat detector, Wi-Fi access point or ceiling speaker, each with its spacing). It starts on the smoke detector, so FILL no longer asks for a device first. The arrow beside Coverage chooses the system shown: fire alarm, CCTV, data and Wi-Fi or public address. Neither follows the device chosen in the side panel any more.' }
    ]
  },
  {
    version: '2.274', date: '2026-11-23',
    items: [
      { title: 'Design CAD: Text style and Multileader style match Dimension style', text: 'Annotate → Text style and Multileader style open in the same wider layout as Dim style: the styles beside the preview, with New, Delete and Set current under them. Text style now shows a sample of its text on paper, its height marked at the left. In both, the part the value you are setting changes shows in gold, named under the preview, and Multileader style has a swatch beside its arrowhead list.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.273', date: '2026-11-23',
    items: [
      { title: 'Design CAD: Dimension picks its kind from what you click', text: 'Annotate → Dimensions → Dimension (DIM): click a line for its length, an arc for its radius or a circle for its diameter, or two points as before; then click where the dimension goes. Two points or a line give a horizontal or vertical dimension by where you drag, and one along a sloping line beside it. Aligned is now DAL (Linear\'s arrow).', action: 'cad' },
      { title: 'Dimensions: style and layer lists, and Update', text: 'The Dimensions panel shows the dimension style (with dimensions picked, theirs: choose another to change them) and the layer new dimensions go on: LV-ANNO as before, the current layer, or a layer you choose (DIMLAYER). Update (DIMSTYLE A) gives the dimensions picked the current style. The corner button opens Dimension style.', action: 'cad' },
      { title: 'Dimensions: Linear and Continue keep the form you used last', text: 'Linear\'s arrow holds Linear, Aligned, Angular, Radius and Diameter; Continue\'s holds Continue and Baseline. Each button shows the form used last, ticked in its list.', action: 'cad' }
    ]
  },
  {
    version: '2.272', date: '2026-11-23',
    items: [
      { title: 'Load schedule: every ELCB is its own device', text: 'Click an ELCB on the DB schedule and choose 3, 6, 9 or 12 circuits: only that ELCB and the one next to it change. Edit and Remove are on the same menu, and on ELCB / RCD with a circuit selected.' },
      { title: 'New ELCBs and Re-group all ELCBs', text: '"ELCB per" is now "New ELCBs" (3, 6, 9 or 12 circuits): the size for ways that have no ELCB yet, so changing it no longer changes every ELCB on the DB. Re-group all ELCBs… cuts the whole DB again after showing before and after, keeping lighting and power apart if you ask.' },
      { title: 'Balance phases keeps each ELCB', text: 'Balance phases now moves 1-phase circuits only inside their own ELCB, so every ELCB keeps its circuits and its size.' },
      { title: 'Excel sheet shows the ELCBs of a new DB', text: 'A DB whose ELCB size was never changed printed an empty ELCB column on its Excel sheet; it now shows the same ELCBs as the schedule and the PDF.' }
    ]
  },
  {
    version: '2.271', date: '2026-11-23',
    items: [
      { title: 'A click on empty space no longer picks a whole plan', text: 'In Design CAD, a click that landed on no line but inside a block picked that block, however large: on a drawing with a frame or a plan kept as one block, a near miss picked everything. A click inside a block now picks it only while the block is symbol-sized on screen (a board, a fitting); on its lines it is picked as before.' }
    ]
  },
  {
    version: '2.270', date: '2026-11-23',
    items: [
      { title: 'Design CAD: dimension text no longer crosses its line', text: 'With the text Outside (the usual place, and every dimension drawn before dimension styles), a dimension drawn below what it measures, or to the right of it with the text reading upwards, had its text across its own line. The text now sits fully on the side away from what is measured, the same distance off the line as above it. Dimensions already drawn that way show their text moved out, on the plan, on the sheets and in Save DXF / DWG.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.268', date: '2026-11-23',
    items: [
      { title: 'Design CAD: a clearer Dimension style dialog', text: 'Annotate → Dimensions → Dim style (D) opens a wider dialog, so no name breaks over two lines. The styles sit beside the preview, with New, Delete, Set current and Import DXF… under them. The preview is drawn black on white as on the sheets, with a horizontal and a vertical dimension, and the part the value you are setting changes shows in gold, named under it. A swatch beside each arrow list shows the arrow chosen. The tabs keep one height, so Cancel and OK stay put. Two names are clearer: Extend beyond dimension line, and Extend past extension lines.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.267', date: '2026-11-23',
    items: [
      { title: 'The command line and AI connection read the drawing file too', text: 'lvds (the command line, the MCP server for your own AI assistant and the local API) now opens a project with its Name.lvplan drawing file, as the app does, so exports, ELV schedules and the floor plan tools see the drawn work and the drawing units you chose. A change made through lvds keeps the drawing file as it is, and a change is refused if the drawing file was changed by someone else in the meantime.' },
    ]
  },
  {
    version: '2.266', date: '2026-11-23',
    items: [
      { title: 'Design CAD: the Hatch strip', text: 'While you hatch (H) or edit a hatch (HE), a strip takes the ribbon\'s place instead of the side panel: Boundary, Pattern, Properties, Origin, Options and a Done button. Pattern swatches show the real pattern with a plain name (Diagonal, Cross, Brick), and All patterns lists your own and imports or exports a pattern file.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Hatch: Select, Set point, Match and Outline', text: 'New hatches can be made by clicking a closed polyline, rectangle or circle (Select), take their pattern origin from a click or from the corner or centre of the boundary (Set point), or copy another hatch (Match). Outline draws a polyline along the edge of the hatch being edited.' },
    ]
  },
  {
    version: '2.265', date: '2026-11-23',
    items: [
      { title: 'Drawings are kept in their own file beside the project', text: 'What you draw in Design CAD (drawn objects, the drawing\'s own blocks, erased objects, layouts, layer settings, units and drawing styles) is now saved in a second file beside the project, Name.lvplan, and the project file links to it. A project with a lot of drawn work is about 12 times smaller, and a save writes the drawing file only when the drawn work changed. Keep the two files together when you copy, send or back up a project. An older project moves its drawings to the new file at its next save; earlier versions of the app then open it read-only. If the drawing file is missing or does not match, the project opens without its drawings, read-only, and nothing is saved over them.' },
    ]
  },
  {
    version: '2.264', date: '2026-11-23',
    items: [
      { title: 'Sample projects for every SLD start level', text: 'Eight ready-made projects, one for each way a new project can start (a final DB, a sub-main board, a main board on an LV source, a transformer, an RMU with one or two transformers, an 11 kV ring, and a generator with solar), are in the docs/samples/start-levels folder. Open one with File → Open, then Save as under a new name to keep the sample unchanged.' },
    ]
  },
  {
    version: '2.263', date: '2026-11-23',
    items: [
      { title: 'Design CAD no longer stops on a very large selection', text: 'Picking a very large number of objects at once (Select all on a dense drawing, for example) could stop the page with "Maximum call stack size exceeded". The selection toolbar, zoom to objects, the right-click menu from the keyboard and the block dialog now handle any number of picked objects.' }
    ]
  },
  {
    version: '2.262', date: '2026-11-22',
    items: [
      { title: 'The incoming cable counts in an assumed fault level', text: 'A first board with an incoming cable typed on its Supply tab and no fault level given used to take the assumed source level (about 25 kA at 415 V) at its busbar, ignoring the cable. The cable is now counted, as it already is when a fault level is given, so the level at the board is lower. The level is still marked assumed and its checks stay not verified until a fault level or a source rating is typed.' },
    ]
  },
  {
    version: '2.261', date: '2026-11-22',
    items: [
      { title: 'A generator or inverter source gives a calculated fault level', text: 'On the Supply tab of a first board fed by an LV source, type the rating (kVA) of a diesel generator, solar PV, wind or battery source and the fault level is calculated: a generator from its rating and X″d (default 15 %), an inverter source from a multiple of its rated current (default 1.2 ×). The system diagram says "calculated", the breaking capacity and busbar checks run on it, and the earth loop and the allowed load follow. A fault level you type still wins; with no rating the level stays assumed, as before. A generator with no minimum fault level typed is marked not verified for earth-fault disconnection, and a fault current at or below the breaker rating now fails it.' }
    ]
  },
  {
    version: '2.260', date: '2026-11-22',
    items: [
      { title: 'RMUs that feed nothing yet are drawn', text: 'A grid source and an RMU record with no transformer yet are now drawn on the 11 kV side of the system diagram and in the MV overview, with every tee-off marked SPARE. They stand in their substation, after the RMUs that feed transformers, and the Substations card and the schedules list them as before.' },
      { title: 'Add transformer and main board, from the RMU', text: 'Right-click an RMU (or a spare tee-off) and choose Add transformer and main board: a new main board with a 1000 kVA transformer is put on the RMU, in its substation, as one undo step. When the RMU is full it asks first, and offers to change RRT to RRTT or RRTT to RRTTT. Right-click the empty drawing, Add ▸ RMU adds an RMU that feeds nothing yet; Remove RMU-x on the menu of an RMU that feeds nothing takes it away again.' },
      { title: 'An RMU entered earlier now shows', text: 'An RMU you entered earlier that feeds nothing now appears on the drawing, in the MV overview and on the sheets that draw the ring (those sheets show as changed). The RMU box is drawn without a fill colour.' }
    ]
  },
  {
    version: '2.259', date: '2026-11-22',
    items: [
      { title: 'Add upstream board…: grow the project upward', text: 'Right-click a first board on the system diagram (or on its Board tab) and choose Add upstream board…. A DB gets an SMDB above it, an SMDB an MDB, and an MDB a transformer. The incoming cable you typed becomes the way from the new board, everything you typed for the supply (the given values, source name, meter, reference) and the earth pits move up to the new first board, and the values at the old board are calculated from then on. The way gets its breaking capacity from the fault level; a device typed as an isolator is replaced by a breaker of that rating, to set. An existing board stays existing. On the Board tab the view stays on the board. One undo step, nothing to re-enter.' },
      { title: 'Connect to…: join a first board to a board in the project', text: 'Right-click a first board on the system diagram and choose Connect to… to pick a board already in the project. The typed incoming cable becomes the way from that board (a default way, marked to check, when none was typed). It asks first only when something you typed for the supply would be removed, and names it. Moving a first board in the panel tree does the same.' }
    ]
  },
  {
    version: '2.258', date: '2026-11-22',
    items: [
      { title: 'New project: choose where the SLD starts', text: 'The New project wizard has a new second step, SLD start, with six pictures: a final DB, a sub-main board, a main board on an LV source, a transformer and main board (the default), an RMU with one or two transformers, or an 11 kV ring with two substations. The project is made with the first board or boards of that start; the two 11 kV starts open the MV supply and RMUs card straight after. Quick create keeps the transformer start. The choice can be changed afterwards on the board\'s Supply tab.' },
      { title: 'Any board can be the first board on the empty canvas', text: 'On the system diagram every board type can now be dropped on the empty canvas. Main boards (MDB, LV-MDB, LV-ACB) and meter cabinets are made as before; any other board starts as a first board fed from a board outside the project. Set its supply on the Supply tab. The busbar rules are unchanged.' }
    ]
  },
  {
    version: '2.257', date: '2026-11-22',
    items: [
      { title: 'The Supply tab of a first board starts with Fed from', text: 'Select a first board and open its Supply tab (or double-click the board and open Supply): it now starts with Fed from, four choices: a transformer, an LV source (a utility, a supplier or your own generation), a board outside this project, or not set yet. A transformer shows its rating, impedance, X/R and vector group as before. A source shows its Kind (utility, diesel generator, solar PV, wind, battery storage or other), its Name and a Reference. A board outside the project shows the Feeding board and a Reference. Both then take the values given from upstream (fault level, X/R, minimum fault level, drop already used, earth loop impedance, allowed load), the upstream device and the incoming cable, which is checked like a feeder. Changing the choice asks first when it would remove values you typed. Supplied from, the supply chain line and Related equipment now say what feeds the board.' },
      { title: 'The grid source operator is free text', text: 'In Panels → Transformers the Operator of an MV grid source is now typed (it suggests the authority of the applied design reference and the operators already on the project), and a new grid source starts with no operator.' }
    ]
  },
  {
    version: '2.256', date: '2026-11-22',
    items: [
      { title: 'A first board without a transformer shows its supply', text: 'On the system diagram, the Board tab and the printed board sheet, a first board with no transformer now draws where it is fed from: a source (a utility with its meter; a generator, solar, wind or battery source without a meter cabinet unless a meter type is entered), a continuation marker "From <name>" for a board outside the project, or a dashed "Supply not set" stub when nothing is entered. With no name typed it says "Source", never a supplier name (the feeder riser drawing too); on the printed sheet the name keeps the case you typed, and the lists that group these boards say "LV source"; a new first board is named only when a design reference is applied. Each source kind has its own symbol (utility, generator, solar PV, wind, battery, other); for now the kind is set with the set-supply command (--kind), and the Supply tab follows.' }
    ]
  },
  {
    version: '2.255', date: '2026-11-22',
    items: [
      { title: 'Values given from upstream are used in the calculations', text: 'For a first board that is not fed by its own transformer, the calculations now take the fault level with its X/R, the voltage drop already used upstream, the earth loop impedance, the incoming cable from the supply point (checked as an incomer), the upstream device (compared with the outgoing breakers) and the load the supply can give. The Overview lists what fails. For now they are set through the command-line and assistant tools (set_supply); the Supply tab follows.' },
    ]
  },
  {
    version: '2.254', date: '2026-11-22',
    items: [
      { title: 'A source with no data is marked as assumed', text: 'When the first board has no transformer data and no supply fault level, the fault levels below it rest on a placeholder. They are now marked as assumed, and the breaking capacity and busbar Icw checks that use them say "not verified: source fault level assumed" instead of passing or failing.' },
      { title: 'A board on an LV supply is checked from its supply', text: 'A first board with a supply fault level and no transformer now has its earth fault loop checked from that fault level (Ze shown with ≈), is loaded against its supply rating, is energised in the OpenDSS export and is no longer listed for transformer sizing.' },
      { title: 'A project can start at an SMDB or a DB', text: 'A project whose first board is an SMDB or a DB can now complete the "Main boards entered" item of the design-stage checklist.' },
    ]
  },
  {
    version: '2.253', date: '2026-11-22',
    items: [
      { title: 'Design CAD: larger drawings shown in full, and quick when zoomed out', text: 'Design CAD now shows drawings of up to 8 million line pieces in full (3 million before), so a typical 3 MB DWG opens complete. Zoomed out, a large drawing is drawn with fewer corners on its curves, which you cannot see at that size, so panning and zooming stay quick; snaps and picks still use the full drawing. A drawing larger still says how much of it is shown.', action: 'cad', actionLabel: 'Open Design CAD' },
    ]
  },
  {
    version: '2.252', date: '2026-11-21',
    items: [
      { title: 'Design CAD: large drawings open up to 3 times faster', text: 'Opening a drawing in Design CAD is faster: a 1 MB DWG now opens in about a quarter of the time, a 3 MB DWG in about a third and a 10 MB DWG in a little over half. Nothing changes in how the drawing looks or snaps.', action: 'cad', actionLabel: 'Open Design CAD' },
    ]
  },
  {
    version: '2.251', date: '2026-11-21',
    items: [
      { title: 'Design CAD: Save As starts with DWG', text: 'Design CAD → Drafting settings (DS) → Saving: "Save As format" is now DWG unless you choose otherwise, also for a drawing received as DXF. A format you chose before is kept, and a drawing saved before still starts with the format of its last copy.', action: 'cad', actionLabel: 'Open Design CAD' },
    ]
  },
  {
    version: '2.250', date: '2026-11-21',
    items: [
      { title: 'Tx & Gen sizing shows the load assessment and the space plan beside the study', text: 'Concept → Tx & Gen sizing now starts with a strip that lists future growth, max transformer loading, the size list and the generator margin as the load assessment, the space plan and this study have them, with what differs marked. It is for information: the concept figures and the design figures may differ on purpose, so nothing is changed for you, and "Keep my settings" hides the notice until one of them changes. The "Transformers: concept to design" table is on this page too, with a row for this study (network demand with growth, at the loading limit), and the transformers table has an "In the plan" column with the size and loading the space plan gives each board.' },
      { title: 'Generator: the assessment, the study and the network side by side', text: 'Tx & Gen sizing has a "Generator: concept to design" table: the essential kW, the kVA needed and the set as the load assessment gives them and as this study sizes them, and the set on the network. A line says how much of the essential load is still stand-in feeders made from the load assessment or the space plan. When no generator is on the SLD, "Add emergency boards with a … kVA set…" opens Panels with the emergency boards switched on and the generator filled in. The Standby generator field of the emergency boards now starts with this study\'s set, or else the load assessment\'s; it started blank.' }
    ]
  },
  {
    version: '2.249', date: '2026-11-21',
    items: [
      { title: 'One set of transformer and generator size lists on the three concept pages', text: 'Load assessment, Space plan and Tx & Gen sizing now pick transformer sizes from the same three lists: "DEWA — 500, 1,000, 1,500 kVA", "Market standard — 100 to 3,150 kVA" (16 sizes, with both 200 and 1,500 kVA) and "My catalogue" (your Transformers catalogue, offered when it has sizes). Before, each page had its own lists and the same name meant different sizes. What changes: on Space plan the DEWA list now has 500 kVA, so a plan under about 400 kVA takes one 500 kVA and not one 1,000 kVA. On Tx & Gen sizing the "IEC standard" choice is now "Market standard" or "My catalogue", whichever it was reading. On Load assessment the Supply settings have a "Transformer sizes" list (with "A list I type" for your own sizes); with no catalogue it now starts from the market standard sizes, so a small building can get a transformer below 500 kVA. Generators: Load assessment now picks from the same sizes as Tx & Gen sizing, your Generators catalogue or else 22 standard sizes from 20 to 2,500 kVA; it had 11 sizes, so a set can come out one step smaller (800 kVA where it gave 1,000 kVA).' }
    ]
  },
  {
    version: '2.248', date: '2026-11-21',
    items: [
      { title: 'Space plan: Create / Update supply keeps the loads on the standby generator', text: 'Rows taken from the load assessment now carry their share on the standby generator, and "Create / Update supply" marks that share as essential in the network: a row fully on the generator (lighting, lifts) becomes one essential feeder, a row partly on it (small power, HVAC, pumps) becomes a normal feeder and an essential one, and fire and life safety runs at full load on the generator. The generator sizing on Tx & Gen sizing then sees the same essential load as the load assessment. From v2.242 until now these feeders were made with no essential mark, so the generator came out too small after Create / Update supply. Press "Take loads from the assessment…" and "Create / Update supply" again to bring a plan made since then up to date.' }
    ]
  },
  {
    version: '2.247', date: '2026-11-21',
    items: [
      { title: 'Design CAD: Drafting settings in pages', text: 'The Drafting settings pages are now a list on the left, and Units & level is now two pages: Drawing (the level and units of this drawing) and Saving (Save As format, the .bak copy and the recovery copy, kept on this computer). Labels no longer run into the next row.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.245', date: '2026-11-21',
    items: [
      { title: 'Folder templates: start from a layout', text: 'Preferences → Folder templates → + New now starts from one of six layouts: Discipline-first, Stage-first (Concept, Schematic, Detailed, IFC, each with Calcs and Drawings), Building / phase-first, ISO 19650 containers, Flat & simple, or Blank. Building / phase-first asks what the folders repeat for (the buildings in Building information, or phases you type), the folder name pattern ({BuildingCode}_{BuildingName}) and the shared folders kept once at the top, with a preview for two buildings. Create and edit opens the template in the editor.' },
      { title: 'Project folder: a set of folders per building', text: 'With a building-first template, a board\'s load schedule saves into the folder of the board\'s building (from its floor in Building information); schedules of every board and other outputs of the whole project save into the shared folder (00_Common). Customise… shows each building: a building added later is offered with its folders, and a renamed building gets new folders while its old folder is listed with its file count and left as it is.' }
    ]
  },
  {
    version: '2.243', date: '2026-11-21',
    items: [
      { title: 'Transformers: the assessment, the space plan and the network side by side', text: 'Concept → Space plan and Panels → Transformers now show one table with the transformers as the load assessment gives them, as the space plan arranges them (with its RMUs) and as the network has them: sizes, maximum demand in kVA and loading, with a bar each. A figure that is not the assessment\'s is marked. Before, the transformers were sized in these three places and never shown together. The table appears once two of the three exist.' },
      { title: 'Substation area: a notice when the plan changed', text: 'Concept → Substation area now shows a notice when the space plan (or the SLD) gives other substations, transformer counts or sizes than the ones filled on the page, with "Update from the plan…" (it asks first, as Fill from project does) and "Keep mine", which hides the notice until the plan changes again.' }
    ]
  },
  {
    version: '2.242', date: '2026-11-21',
    items: [
      { title: 'Space plan: "Create / Update supply" keeps what you designed', text: 'The "Create SLD" button on Concept → Space plan is now "Create / Update supply". It makes the plan\'s transformer switchboards, MDBs and SMDBs with one load feeder per row, or brings them up to date when they are already there, and sizes only those incomers and load feeders. Every other board and feeder of the project is kept; before, Create SLD replaced the whole network. The load assessment\'s own MDBs and lump feeders are removed, because the plan\'s rows now carry those loads, so there is one start instead of two. A board the plan no longer has is removed when nothing of yours is on it, and left in place (and named in the status line) when it still feeds your boards. The load feeders of rows taken from the assessment shrink as real DBs and services are designed, the same way the assessment\'s feeders do: the ticked box in Common services… and Generate DBs… covers them too. Load assessment shows a note when the supply is planned in Space plan.' }
    ]
  },
  {
    version: '2.241', date: '2026-11-21',
    items: [
      { title: 'Space plan takes its loads and settings from the load assessment', text: 'Concept → Space plan now starts with a strip that shows the load assessment beside the plan: maximum demand, transformers, transformer sizes and settings, with what differs marked. "Take loads from the assessment…" shows the result first and then fills the plan with one row per building and load category (lighting, small power, HVAC, water heating, cooking, lifts, pumps, EV, special, fire and life safety, your custom loads), each with its diversity; a category is shared between the buildings by their floor area. Rows taken from the rooms or taken before are replaced; rows you typed and the panels already given are kept. "Use the assessment\'s settings" takes its max loading, power factor, spare and coincidence. With both, the plan\'s maximum demand equals the assessment\'s. "Keep my figures" hides the notice until the assessment changes. Nothing moves on its own. The areas grid has a FROM column (assessment, rooms or blank for typed rows), the settings have a Coincidence, and "Use types from my density standard" fills the use types from the density standard in place of a table typed by hand.' }
    ]
  },
  {
    version: '2.240', date: '2026-11-21',
    items: [
      { title: 'Space plan: pick the transformer sizes from a list, with a new market standard list', text: 'Concept → Space plan has a "Size list" setting: "1,000 / 1,500 kVA" (as before, the default), "Market standard" (100, 160, 250, 315, 400, 500, 630, 800, 1,000, 1,250, 1,500, 1,600, 2,000, 2,500 and 3,150 kVA) or "My catalogue" (the sizes in your Transformers catalogue). With the market or catalogue list, "Largest size" sets the biggest transformer the plan may use (1,500 kVA to start with). "Automatic" then picks the smallest size that needs the fewest units, and the Transformer size list and the Size column of each transformer offer the same sizes. Saved plans are unchanged. Concept → Load assessment → Supply settings has a "Market standard sizes" button that fills its Transformer sizes with the same list.' }
    ]
  },
  {
    version: '2.239', date: '2026-11-21',
    items: [
      { title: 'Space plan: "Take areas from the rooms" counts the flats', text: 'Concept → Space plan → "Take areas from the rooms" now adds one area for each flat layout placed on a level (for example "2BR apartment ×160"), with the W/m² and demand factor of its rooms together. Before, only the rooms typed on the levels were taken and the flats were left out, so a tower made of flats gave almost no load. Press the button again to bring an existing plan up to date; the panels already given to areas are kept.' }
    ]
  },
  {
    version: '2.238', date: '2026-11-21',
    items: [
      { title: 'Building: choose which assessment space a room type counts as', text: 'Concept → Building → Room types has two new columns. "Assessment space" sets which space of the load assessment the rooms of that type count as: a space of your density standard, "Basement car park", or "By name" (the same Id or name, as before). Beside it you see that space\'s lighting, power and cooling W/m². The load assessment\'s "Update from Building…" and its Building m² column follow this choice, so the space mix no longer depends on names matching. A room type set to the car park counts in the car park area. "Save as my library" writes the choice to RoomTypes.xlsx in a new Assessment space column.' }
    ]
  },
  {
    version: '2.237', date: '2026-11-21',
    items: [
      { title: 'Your own density standards, kept in the LV Database folder', text: 'A new workbook, SpaceDensities.xlsx, holds your standard values of lighting, power and cooling W/m²: one row per space and location (indoor seating and outdoor seating are two rows), with a Reference for where each value comes from and whether the A/C figure is a cooling load or an electrical load. Rows with the same Standard name are one standard, so you can keep several (company, client, authority). Edit it on the Database page (Space densities tab) or in Excel; the previous file is kept in Backups. Concept → Load assessment has a "Density standard" list beside the building type and an "Edit standards…" button that opens the Database page. A starting type takes the standard\'s figures; a type of your own keeps the figures it was saved with. In the area schedule, a space whose figures differ from the standard is marked "edited" with Reset. "+ Space from my standard…" adds a space from it, and "Add these values to my standard…" writes the assessment\'s spaces back (it replaces "Save densities as my library"). The library kept on this computer is still there, as the first standard in the list. A project keeps its own copy: changing a standard later does not move a project.' }
    ]
  },
  {
    version: '2.236', date: '2026-11-21',
    items: [
      { title: 'Building: Common services start from the load assessment', text: 'Concept → Building → Common services… now starts from the load assessment where it has the figure: the lift count and kW, EV chargers from the share of parking bays, pool, façade lighting, fire and jockey pumps, stair fans, booster and transfer pumps and car park fans. A new column says where each starting value comes from; every quantity stays editable. With no assessment, or for a building the assessment does not count, the list starts as before.' },
      { title: 'No double counting: the assessment\'s lump feeders shrink as loads are designed', text: 'The feeders made by Load assessment → "Create MDB + feeders" stand in for loads that are not designed yet. Common services… and Generate DBs… now have a ticked box that reduces those lump feeders by what is being designed (lifts, pumps, EV, lighting, sockets, A/C, water heaters, cookers), and removes a lump when nothing is left of it. "Create / Update MDB feeders" does the same and says how many kW were left out. Before, the real DBs and services were added on top, so the MDB counted the load twice until the lump feeders were deleted by hand. Loads made by hand as a motor or a general load cannot be told apart and are not taken off. On Load assessment, the notice above the button also shows when loads designed since then have put the feeders out of step.' }
    ]
  },
  {
    version: '2.235', date: '2026-11-21',
    items: [
      { title: 'Load assessment: type your A/C figures as a cooling load or as an electrical load', text: 'Concept → Load assessment → Area schedule has an "A/C figures" switch. "Cooling load" is as before: thermal W/m², turned into electrical kW by the cooling system\'s factor. "Electrical load" is for a standard that gives the A/C load as electrical W/m²: the figures are used as typed and the system factor is not applied. Switching converts the figures with the factor of the cooling system in use, so the load stays the same until you type your own. A type saved as "my type", your space library and the reports remember which of the two the figures are.' }
    ]
  },
  {
    version: '2.234', date: '2026-11-21',
    items: [
      { title: 'Load assessment: the building type is one list', text: 'Concept → Load assessment: the row of building type buttons is now one list. It shows the starting types and then your own types in a group, each with its typical VA/m², and ends with "+ Save the current set-up as a new type…", which does what the "+ Custom type" button did. Picking another type still asks before it replaces the area schedule, services and diversities.' }
    ]
  },
  {
    version: '2.233', date: '2026-11-21',
    items: [
      { title: 'Load assessment: a Location for each space (indoor, not cooled, outdoor)', text: 'Concept → Load assessment → Area schedule has a Location column: Indoor cooled, Indoor not cooled, Outdoor covered or Outdoor open. Lighting and power W/m² are typed per row, so the same space can be listed twice with its own values, for example indoor seating and outdoor seating. A space that is not cooled or is outdoors carries no cooling load: its Cooling cell reads "none". An outdoor space is outside the GFA, so it is shown beside the total and not in it. Plant rooms and stores now start as not cooled. The Design Basis and concept reports name the location of such spaces. Saved assessments are unchanged: a space with no location is indoor and cooled, as before.' }
    ]
  },
  {
    version: '2.232', date: '2026-11-21',
    items: [
      { title: 'Concept to design: the assessment, the rooms and the load schedules side by side', text: 'Concept → Load assessment and Concept → Building now show one table with three figures: the assessment (maximum demand at the transformer), the rooms (the sum of the room types of Building, with no diversity between flats and no lifts, pumps or EV), and what the load schedules add up to so far, with the DBs made out of those planned. "Per building" opens the rows per building. The rooms figure is not meant to equal the assessment: the table shows how far apart they are. The table replaces the "Designed so far" line, and it no longer counts the assessment\'s own feeders as designed load.' },
      { title: 'Load assessment: a notice when the MDB feeders are older than the assessment', text: 'After "Create MDB + feeders", a change to the assessment (or to its transformers) now shows a notice above the button with the two demand figures, until "Update MDB feeders" brings the feeders in step.' }
    ]
  },
  {
    version: '2.231', date: '2026-11-21',
    items: [
      { title: 'Load assessment and Building are linked both ways', text: 'Concept → Load assessment now starts with a strip that shows Building information beside the assessment: GFA above ground, floors, car park and the space mix, with what differs marked, and tick boxes for the buildings counted. "Update from Building…" shows the result first (maximum demand, VA/m², lifts, transformers, generator) and then takes the figures, the area schedule or both as one undo step; your own W/m², services and diversities are kept. "Keep my figures" hides the notice until Building changes again. Nothing moves on its own. The area schedule has a Building m² column beside each space. The strip replaces the "GFA from Building" and "From Building rooms" buttons. Concept → Building shows the assessment on its own line (maximum demand, transformers, generator, VA/m²) with "Update the assessment…" and "Open load assessment", or "Start load assessment" when there is none yet.' }
    ]
  },
  {
    version: '2.230', date: '2026-11-21',
    items: [
      { title: 'Load assessment and Building: every building and the flats are counted', text: 'Concept → Load assessment: "GFA from Building" now adds up every building (GFA and car park; floors of the tallest one), and "From Building rooms" counts the flats placed on the levels as well as the rooms. Before, only the first building was read and the flats were left out. The rooms of a flat (living, bedroom, kitchen, bathroom) go into one Apartment row marked as a dwelling, so water heating and cooking are included; a toilet or pantry counts as back of house. Car park rooms on a repeated basement level count once per floor, and with no Car park rooms the basements\' gross area is used. Concept → Building: the Load and Rooms figures, the load per level and a busbar riser taken from the building now include the flats, so these figures rise for a building with flats. Press the two buttons again to bring an existing assessment up to date.' }
    ]
  },
  {
    version: '2.229', date: '2026-11-20',
    items: [
      { title: 'BOQ: each RMU as you entered it', text: 'The BOQ\'s RMU line now follows the RMU\'s details in Panels → Transformers: its ring switches and tee-offs from the configuration (RT, RRT, RRTT, RRRT, RRTTT), a switch-fuse or circuit breaker tee-off, and the insulation. With no configuration entered it has two ring switches and a tee-off for each transformer on it, as the SLD draws it. Before, every RMU had one switch-fuse tee-off, so an RMU feeding two transformers was listed one short. A standard RMU (two ring switches, one switch-fuse tee-off, no insulation entered) keeps its BOQ line and item number; any other gets a line of its own. An RMU with no name no longer shows its transformer twice in the Location column.' }
    ]
  },
  {
    version: '2.228', date: '2026-11-20',
    items: [
      { title: 'Printed SLD: MV cables black, RMU box white', text: 'On PDF sheets and SLD exports, the MV lines (the ring, the cables into each RMU and down to the transformers) now print solid black like every other cable. They printed grey and could look blurred when zoomed in. The RMU box now prints white; it printed as a dark fill that hid the switches drawn inside it. The drawing on screen is unchanged.' }
    ]
  },
  {
    version: '2.227', date: '2026-11-20',
    items: [
      { title: 'Design CAD: the Block definition dialog is laid out as a form', text: 'The Block definition dialog (BLOCK, B) is wider and each row fits what it holds: Pick point with the X and Y boxes on the Base point row, Select objects with the count beside it, then Retain, Convert to block and Delete on one line. Before, these overlapped. A click on the words Base point or Objects no longer starts picking; only the buttons do.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: Point style and Attribute definition dialogs', text: 'In Point style (PTYPE), the two Size options, Relative to screen and In absolute units, are on a line each; before, their words ran over Cancel and OK. In Attribute definition (ATTDEF), Pick on plan has a row of its own and the X and Y boxes below it are wide enough to read; before, the button overlapped the rows and the boxes were too narrow to use.' }
    ]
  },
  {
    version: '2.226', date: '2026-11-20',
    items: [
      { title: 'Design CAD: Trim cuts circles and arcs', text: 'Trim (TR) now works on a drawn circle or arc: click the part to cut away and it is cut at the nearest crossings on either side of the click, as a line is. A circle needs two crossings and becomes the arc that is left; an arc loses an end, or its middle and becomes two arcs. The part to go shows dashed before the click. A line trimmed or extended to a circle or arc now ends on the curve itself; before, it ended on a chord of it, a little off the curve.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.225', date: '2026-11-20',
    items: [
      { title: 'Panel tree: the Group switch before substations are named', text: 'The panel tree\'s Group switch (Boards | Substations) now shows in every project with a main board fed from the MV side, not only once substations are named. Substations stays greyed until a main board names its substation or RMU, and its tooltip says where: Panels → Transformers. A project with only meter cabinets on an authority LV supply has no switch, as before.' }
    ]
  },
  {
    version: '2.224', date: '2026-11-20',
    items: [
      { title: 'Sheets menu on the SLD page', text: 'A Sheets menu now follows the System diagram, Board, Earthing and Riser tabs (⌘5 / Ctrl+5). It lists the sheets of the view on screen, then All sheets, Sheet setup, Title block and numbering, and Issues and transmittals, and each item opens that sheet or tab in Design CAD → Sheets. On the board view, Make a sheet of … on its own adds the board\'s circuit-diagram sheet and opens it.' }
    ]
  },
  {
    version: '2.223', date: '2026-11-20',
    items: [
      { title: 'MV voltage from the grid source', text: 'Each transformer\'s ratio on the SLD, the MV overview sheet\'s transformer schedule, a main board\'s incoming supply on the Board view, the equipment schedule and the BOQ\'s transformer and RMU lines now give the voltage of the grid source feeding the transformer: its RMU\'s source, else the first one in the MV supply and RMUs card (Panels → Transformers). Before, they said 11 kV whatever the source. The BOQ\'s transformer line also takes the project\'s LV voltage, as the SLD does. At 11 kV and 415 V nothing changes, and the BOQ keeps its item numbers.' }
    ]
  },
  {
    version: '2.222', date: '2026-11-20',
    items: [
      { title: 'Sheets: one sheet per substation', text: 'Design CAD → Sheets → Make the sheets automatically has a fourth button, One sheet per substation, once a main board names its substation or RMU. It makes an MV overview sheet, then one sheet per substation in ring order with its main boards and everything they feed (a bus coupler between them stays on the sheet), then a sheet for each RMU or transformer in no substation and each board on an authority LV supply. One sheet per MDB stays as it was.' },
      { title: 'Sheets: the MV overview', text: 'The MV overview sheet draws the source, the ring, the substations with their RMUs and transformers, and each main board as its name with the sheet it is drawn on. Under the drawing, an RMU schedule (substation, ways, ratings, tee-off protection, what each tee-off feeds and the normally open switch) and a transformer schedule (kVA, Z %, group, ratio, substation, RMU way, main board and sheet) stand side by side, in the PDF and in DXF.' }
    ]
  },
  {
    version: '2.221', date: '2026-11-20',
    items: [
      { title: 'Substations card', text: 'Panels → Transformers has a new Substations card, one row per substation in ring order: its DM-D-013 type and location (the same record as the Substation area page), its RMUs with their configuration, its transformers and spare tee-offs, the owner of its RMUs and its checks. The SLD draws the substations left to right in this order; ▲ ▼ change it. + Substation adds one, + RMU adds an RMU to a substation before it feeds a transformer. The checks show a POCKET type or open roof substation with too many transformers, an RMU with more transformers than tee-offs or feeding two substations, and two normally open points on one ring.' },
      { title: 'SLD: right-click Substation, RMU, Configuration and Normally open', text: 'Right-click a transformer on the SLD for Substation ▸ (the substations in ring order, or a new one) and RMU ▸ (each RMU with its free tee-offs, or a new one, which starts as RRT). Right-click an RMU for Configuration ▸ and Normally open ▸ (R1, R2 or none). The normally open ring switch is marked N/O on the SLD, on sheets and in DXF.' },
      { title: 'Transformer table: RMU tee-offs', text: 'The RMU column of the transformer table lists each RMU with its configuration and free tee-offs. A full RRT or RRTT unit is offered as RRTT or RRTTT, a transformer put on an RMU joins its substation, and a new RMU starts as RRT.' }
    ]
  },
  {
    version: '2.220', date: '2026-11-20',
    items: [
      { title: 'Search opens the drawing sheet', text: 'Picking a sheet under Drawing sheets in Search (⌘K / Ctrl+K) now opens that sheet in Design CAD → Sheets. Before, it showed the SLD instead.' }
    ]
  },
  {
    version: '2.219', date: '2026-11-19',
    items: [
      { title: 'Project folder: customise for this project', text: 'Overview → Project folder → Customise… shows this project\'s folders with what is on disk (present, to create, hidden here, renamed here). Add folders, rename, hide a template folder or move a role for this project only: the changes are saved in the project, and the office template is not changed unless you choose Save these changes back to the template…. A rename makes the new folder and lists the old one, with its file count; nothing is moved. Reset to template undoes the project\'s changes.' },
      { title: 'Project folder: change template', text: 'Change template… compares the project\'s folders with another template before anything is done: folders to create, kept (and roles that move), and those not in the new template, which are left as they are with their file count. Show where old files would go lists each output\'s old and new folder. Apply only creates folders, switches the template and lists the project changes that no longer apply.' }
    ]
  },
  {
    version: '2.218', date: '2026-11-19',
    items: [
      { title: 'Sheets: ELV formulas', text: 'Formulas in Sheets can now size ELV systems with the methods of the ELV estimate: FABATT(quiescent mA, alarm mA) for the fire alarm battery in Ah (24 h standby, 30 min alarm, × 1.25 unless given), FACHARGE(Ah) for the charger current, POESWITCH(devices, W each, ports, PoE budget W) for the PoE switches, CAMRANGE(field of view °, pixels, "R") for how far a camera can detect, observe, recognise or identify ("D", "O", "R", "I"), PAWATTS(speaker taps W) for the PA amplifier power, NVRTB(cameras, Mbps, days) for the recording storage in TB, and VDDC(mA, length m, mm²) for the voltage drop of a 24 V loop or sounder circuit.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.217', date: '2026-11-19',
    items: [
      { title: 'Sheets: electrical formulas', text: 'Formulas in Sheets can now use the app\'s own electrical functions, worked out with its cable and breaker data: AMPS(kW, pf) for the current, KW(A, pf) for the power, VD(A, length m, mm², pf) for the voltage drop %, BREAKER(A) for the next breaker rating, CABLESIZE(A, length m, pf, ambient °C, VD limit %) for the cable, DERATE(ambient °C) for the rating factor, CPC(mm²) for the earth conductor, TXSIZE(kVA) for the transformer, FAULTKA(kVA, Z %) for the fault level and KVAR(kW, pf now, pf target) for the capacitors. Phases (3 or 1) and the voltage can follow; 400 V or 230 V is used without one. Excel does not have these functions, so a saved Excel file gets their values, with the formula in the cell\'s note; Sheets reads the formula back when it opens the file.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.214', date: '2026-11-19',
    items: [
      { title: 'Panel tree: Group by substation', text: 'Once a main board names its RMU or substation (Panels → Transformers), the panel tree has a Group switch: Boards, as before, or Substations. Substations lists each substation, its RMUs and their main boards with the transformer\'s kVA (and its number, e.g. TX-1, when the tree is wide enough), then the boards below. Main boards in no substation go under "No substation", meter cabinets under "Authority supply". On the SLD page a click on a substation or RMU shows it on the drawing; on other pages a double-click does. Find a board… also finds a substation or RMU by name.' }
    ]
  },
  {
    version: '2.212', date: '2026-11-19',
    items: [
      { title: 'SLD: Show one substation, RMU or transformer', text: 'SLD ribbon → View → Show lists the whole network, the MV overview, then each substation with its RMUs and their transformers (with kVA, main board and the boards each holds) and the boards on an authority LV supply. Pick one to draw only that part, with everything its main boards feed. The ring, an RMU\'s other tee-offs and a bus coupler to a board not drawn become stubs, e.g. "BC-1 to MDB-1 (TX-1)". Only the view changes: results, checks and fault levels stay those of the whole network.' },
      { title: 'SLD: the MV overview', text: 'Show → MV overview draws only the MV side: the source, the ring, the substations with their RMUs and transformers, and each main board as its name. Double-click a substation frame there to show that substation.' },
      { title: 'SLD: the Showing chip', text: 'While a part is shown, a chip at the drawing\'s top left names it and what it holds, with ◀ ▶ for the previous or next substation, RMU or transformer, and Show all. Selecting a board outside the part (panel tree, Check, Find) shows that board\'s part.' },
      { title: 'SLD: right-click Show … only', text: 'Right-click an RMU, a substation frame or a transformer on the SLD → Show … only; the empty drawing\'s menu has Show all while a part is shown. Export… exports what is shown, titled with it, e.g. "SINGLE LINE DIAGRAM — SS-1".' }
    ]
  },
  {
    version: '2.211', date: '2026-11-19',
    items: [
      { title: 'Cable type: Auto names the cable it gives', text: 'In the SLD cable editor (click the cable text of a way) and on the Cable tab of the feeder form, the Auto choice now names the cable a way gets when no type is chosen: the default armoured cable, or fire-rated cable for a life safety circuit. Before, it repeated the type chosen by hand.' }
    ]
  },
  {
    version: '2.210', date: '2026-11-19',
    items: [
      { title: 'SLD PDF: feeder lines, breakers and way numbers print black', text: 'On printed SLD sheets, feeder lines, breaker symbols and load boxes now print black, not grey, and the way numbers print solid black and sharp instead of faded. Secondary texts such as the breaking capacity and the dashed panel frames stay grey.' },
      { title: 'SLD DXF / DWG: panel frames grey with closer dashes', text: 'The dashed frame round a panel goes on its own grey layer, E-PANEL, instead of the cable layer, and is drawn with half the gap between dashes (3 mm dash, 0.75 mm gap).' }
    ]
  },
  {
    version: '2.209', date: '2026-11-19',
    items: [
      { title: 'MV, not HV, for the 11 kV side', text: 'The 11 kV supply is now called MV (medium voltage) throughout the app: the MV supply and RMUs card in Panels → Transformers and its item in the SLD ribbon\'s Supply menu, the Shared MV body earth earthing system and the MV BODY note on the earthing schematic, the MV supply row of the revision compare, and the MV network line in the reports. Projects open as before; only the names changed. The DEWA forms keep DEWA\'s own wording, LV/HV-CT.' }
    ]
  },
  {
    version: '2.208', date: '2026-11-19',
    items: [
      { title: 'SLD: the 11 kV ring by substation and RMU', text: 'When a main board names its RMU or its substation (Panels → Transformers), the SLD draws the 11 kV ring from the grid source through each RMU: its ring switches, its tee-offs (switch-fuse with its fuse rating, or breaker with 50/51, 50N/51N) and SPARE for a tee-off with no transformer. Each transformer stands under its tee-off. Each substation gets a dash-dot frame round its RMUs and transformers, titled with its type and building from the Substation area page. Main boards stand by substation, then by RMU. Each grid source has its own ring. The sheets and the DXF / DWG export show the same.' },
      { title: 'SLD sheets: the rest of the ring as stubs', text: 'A sheet or study report that draws only some main boards shows an RMU\'s other tee-offs, and the ring\'s ends, as stubs naming the transformer or RMU drawn elsewhere, never as spares. Each transformer keeps its number from the whole project: on its own sheet, TX-2 was labelled TX-1 before. A sheet issued from now on is marked as changed when what it shows of the ring changes.' },
      { title: 'SLD: meter cabinet off the 11 kV line', text: 'A main board on an authority LV supply has its own source symbol and stands after the transformers, so the 11 kV line no longer runs across its meter cabinet.' },
      { title: 'Transformers: RMU limit from its tee-offs', text: 'In Panels → Transformers an RMU takes as many transformers as its configuration has tee-offs (RT and RRT 1, RRTT 2, RRTTT 3), not 2 for every RMU. With no configuration entered it stays at 2.' },
      { title: 'Substation area: Fill from project by substation', text: 'Fill from project makes one substation for each substation name on the main boards, so a substation with two RMUs is one substation, not two. Main boards with no substation name are grouped by RMU, as before.' }
    ]
  },
  {
    version: '2.207', date: '2026-11-18',
    items: [
      { title: 'SLD: Show this branch only', text: 'Right-click a board and choose Show this branch only: everything not fed from that board is dimmed. Esc, or Show everything on the empty drawing, ends it. The dimming is on screen only; exports are unchanged.' },
      { title: 'Board tab: right-click menus', text: 'The Board tab has the right-click menus too, for its ways and its sub-boards (Shift+F10 opens the menu of the selected way). The view stays on that board.' }
    ]
  },
  {
    version: '2.206', date: '2026-11-18',
    items: [
      { title: 'SLD: pick several', text: 'Shift+click loads and boards, or Shift+drag a window on the empty drawing (a plain drag still pans). A right-click on any of them opens one menu for all: Edit together, Change, Copy, Duplicate, Move to board, Delete and Zoom to. Esc clears.' },
      { title: 'SLD: select tools', text: 'Select similar on a load (same load type on its board or everywhere, or every failing circuit), Select everything below on a board, and Select on the empty drawing (all loads, failing circuits, circuits to check, boards of one kind).' }
    ]
  },
  {
    version: '2.205', date: '2026-11-18',
    items: [
      { title: 'SLD: Move (M)', text: 'Choose Move on a board or a load (or press M), then click the busbar or the load it goes to. The place lights up, or the label says why it can\'t go there. Esc or a right-click cancels.' },
      { title: 'SLD: Supply from… and Move to board…', text: 'A list of boards for a board or a load whose new place is off screen. A board moved on the drawing now gets its incomer flagged for a length check, shown as len? under its values on the drawing.' }
    ]
  },
  {
    version: '2.204', date: '2026-11-18',
    items: [
      { title: 'SLD: right-click menus', text: 'Right-click a board, a load, a transformer, a bus coupler or the empty drawing on the SLD for its menu (Shift+F10, or the menu key, opens it for the selection). Each menu lists what you can do there: edit, load schedule, add, copy and paste, rename, delete, show on plan, properties, and the drawing\'s view settings on the empty drawing.' },
      { title: 'New on the SLD', text: 'Zoom to (Z), Order a way or a board on its busbar (Alt+Left / Alt+Right, first, last), Copy and Duplicate a load (Ctrl+D), Duplicate a board, Rename a board, a Quick fix list for a failing circuit, and Change on a load: switching device, earth leakage, kWh meter, phase, cable type, essential, existing and local isolator.' }
    ]
  },
  {
    version: '2.203', date: '2026-11-18',
    items: [
      { title: 'SLD: kWh meter clear of the cable text', text: 'A kWh meter on a way now has its own row inside the panel, like the ELCB, so it no longer sits on the cable text. On a way with both, the meter is under the ELCB. The meter is drawn a little larger, so "kWh" fits its box. The same applies in the DXF / DWG export.' }
    ]
  },
  {
    version: '2.202', date: '2026-11-18',
    items: [
      { title: 'Design CAD: symbol letters at their size', text: 'The letters in the device palette\'s symbols (F, EF, FL, C, 15 and others) drew far too large, over the buttons. They now draw at symbol size. The same fix keeps texts at their size and black in the block previews of the Blocks palette and in the Multileader and Dimension style previews.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.201', date: '2026-11-18',
    items: [
      { title: 'Load schedule: ELCB and RCBO placed by hand', text: 'Add → ELCB / RCD puts a 3-phase ELCB (4-pole, or 3-pole) over chosen ways or over one 3-phase circuit, or an RCBO in place of a 1-phase circuit\'s MCB. A circuit has an ELCB or an RCBO, never both. They print in the ELCB column and count in the BOQ, the enclosure and the earth-fault check.' }
    ]
  },
  {
    version: '2.200', date: '2026-11-18',
    items: [
      { title: 'Load schedule: a shorter page header', text: 'The Load schedule page header now takes two rows instead of five. The help text is behind the i beside the title, the supply chain (for example TX-1 → MDB-1 → SMDB-GF → DB-GF1) sits on the title row, and the schedule tabs and board buttons share one row. A board\'s rooms check is a short chip at the end of that row, with the full text when you point at it. More circuit rows fit on the screen.' },
      { title: 'Load schedule: add buttons above the schedule', text: 'Right above a DB\'s load schedule: 1-phase circuit, 3-phase circuit, Spare 1-phase (20 A breaker), Spare 3-phase (32 A breaker), Space (1-phase or 3-phase) and Balance phases. New rows go in the next free way. The ribbon keeps the same buttons.' }
    ]
  },
  {
    version: '2.199', date: '2026-11-18',
    items: [
      { title: 'Project folders: exports save into the right folder', text: 'When a project has a project folder on this computer, each save dialog now opens in the folder for that output: the voltage drop report in the voltage drop folder, the BOQ in the BOQ folder, transmittals in their TR folder, issued drawings in their stage and revision folder, and so on. The suggested file name follows the folder template\'s naming rule, for example P2611-E-CAL-004-B.pdf. A folder that is missing is made first. If you save somewhere else, that folder is remembered for this project and kind of output on this computer. Projects without a project folder save as before.' },
      { title: 'Project folders: a copy of the project file', text: 'Each time you save a project that has a project folder, a copy of the project file is also written into the project folder\'s Project file folder, replacing the older copy. The working file stays in the Projects folder as before. If the copy cannot be made, the status line says so once; the project itself is still saved.' }
    ]
  },
  {
    version: '2.198', date: '2026-11-18',
    items: [
      { title: 'Project scope: fire, ELV, tender and supervision', text: 'The Scope step of the project brief has four new items: Fire alarm / Civil Defence, ELV systems, Tender stage and Site supervision. All are off by default. Ticking one switches on the matching project folders (scope:fire, scope:elv, stage:tender, service:supervision) on the Project folder step. They do not change readiness, deliverables or to-do lists, and existing projects are unchanged.' }
    ]
  },
  {
    version: '2.197', date: '2026-11-18',
    items: [
      { title: 'Project number', text: 'A project now has its own project number. Type it on the first step of New project or in Project settings, under Submission forms. It is used in the project folder name (for example P2611_Villa Jumeirah) and in study reports whose own Project no. field is empty. Existing projects keep working: a number typed in Study reports is still used until you give the project its own.' }
    ]
  },
  {
    version: '2.196', date: '2026-11-18',
    items: [
      { title: 'Design CAD: less work for dense drawings', text: 'Design CAD does less work to get a drawing with millions of line pieces ready to show, and lists and counts layers faster in drawings with thousands of them.' }
    ]
  },

  {
    version: '2.195', date: '2026-11-18',
    items: [
      { title: 'Folder templates: learn from a job folder', text: 'Profile & preferences → Folder templates has Learn from folder…. Choose one of your old job folders and the app reads its folder names (never your files, and nothing in the folder is changed), suggests which output saves to which folder, leaves revision and date folders out, and keeps your numbering. Check the suggestions, name the template and it opens in the editor to finish.' }
    ]
  },
  {
    version: '2.190', date: '2026-11-18',
    items: [
      { title: 'Design CAD opens drawings with a damaged record', text: 'A DWG or DXF with a few records that cannot be read, such as an object another program wrote short, no longer stops with "could not be read". The drawing opens without those records; a file with nothing readable still shows the message.' }
    ]
  },
  {
    version: '2.189', date: '2026-11-17',
    items: [
      { title: 'Design CAD: multileader', text: 'One note with several arrows. Annotate → Leaders and tags → Multileader (MLD): click the arrowhead, then the landing, then type the words. It has its own styles (arrowhead, landing, text height, frame; MLS), Add leader and Remove leader, Align and Collect, and a style can fill in the circuit of the device at the arrowhead.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: Annotate in four panels', text: 'The Annotate sub-tab now has Text, Dimensions, Leaders and tags (with Room tag, Tag all rooms and Keynote) and Markup (revision cloud and north arrow).' },
      { title: 'Design CAD: leader arrowheads in Save DXF / DWG', text: 'A leader\'s arrowhead is now written to the DXF or DWG, as it shows on the screen and the plan sheets.' }
    ]
  },
  {
    version: '2.187', date: '2026-11-17',
    items: [
      { title: 'Excel in my format', text: 'Load schedule → Export has Excel: my format and Excel: my format, all panels: the schedule as an Excel file in your own format, filled from the project, one sheet per panel. The file opens with the paper of the format, fitted to the page width, and its heading rows repeat on every printed page.' }
    ]
  },
  {
    version: '2.185', date: '2026-11-17',
    items: [
      { title: 'PDF in my format: choose the paper', text: 'A schedule in your own format can print on A4 or A3, landscape or portrait. Choose it under PDF paper in Sheets → Link columns; it is saved with the format. A PDF of all panels gives each panel the paper of its format.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.184', date: '2026-11-17',
    items: [
      { title: 'Design CAD: boards drawn by their kind', text: 'A board placed on a plan is now drawn with its SLD pattern: a diagonal for a DB, half filled for an SMDB, a cross for an emergency board, a double frame for a main board, and so on, with its tag beside it. Plan sheets print the same symbols and their legend lists each kind shown. Saved DXF and DWG files keep the filled parts solid.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Boards: ESMDB type', text: 'A board can now be set to ESMDB, an emergency sub-main distribution board. It is drawn as a cross with its left and right parts filled, and it counts as emergency supply wherever it is fed from. A sub-main below an EMDB still shows as an ESMDB without changing its type.' }
    ]
  },
  {
    version: '2.183', date: '2026-11-17',
    items: [
      { title: 'Project folders: make a job folder from a template', text: 'New project has a Project folder step: choose a folder template, where the folder goes and its name, untick the folders this job does not need, and the app makes the empty folders. Skip folders keeps things as before. The Overview has a Project folder card that opens the folder, shows which folders are present or missing and makes the missing ones. Only new, empty folders are made: nothing is moved, renamed or deleted. The web version gives the folders as a ZIP file. Project files and exports are still saved where they were.' }
    ]
  },
  {
    version: '2.182', date: '2026-11-17',
    items: [
      { title: 'Folder templates: roles and file naming', text: 'The folder template editor has two more tabs. Roles lists every output the app makes with the folder it saves to: pick a folder, or let Auto-assign match folders to outputs by name. File naming builds the file name from fields such as the project number, document type, number and revision, with a preview for each document type and your own pattern for a type where you need one. Saving files into these folders with these names comes with the project folder step.' }
    ]
  },
  {
    version: '2.181', date: '2026-11-17',
    items: [
      { title: 'Folder templates: library and editor', text: 'Profile & preferences has a new Folder templates tab. It lists the built-in folder templates (locked) and your own. Duplicate one, then add, rename, delete, drag, indent and renumber its folders, and choose which outputs each folder is for. Problems such as a character Windows does not allow are shown as you type. Templates are kept on this computer and can be shared as a file. Nothing is created on disk yet: making a project\'s folders from a template comes next.' }
    ]
  },
  {
    version: '2.180', date: '2026-11-17',
    items: [
      { title: 'PDF in my format: headings on every page', text: 'A schedule in your own format that runs over one page now has its column headings again at the top of each following page (Load schedule → Export → PDF: my format). The headings are the rows directly above the first circuit row; the title and the panel\'s details stay on the first page.' }
    ]
  },
  {
    version: '2.179', date: '2026-11-17',
    items: [
      { title: 'Design CAD: compact colour dialog', text: 'A layer or object colour now opens in a compact dialog that stays inside the window. Index colour has every number from 1 to 255 and a number field; True colour has a colour well, Hex and RGB fields. OK applies it, Cancel or Esc leaves it alone.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: ribbon panels in your order', text: 'Drag a panel by its caption, or use its left and right arrows, to put Layers, Properties and the other panels where you prefer. The order is kept on this computer and works with Show labels; Reset order puts every panel back.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.178', date: '2026-11-17',
    items: [
      { title: 'Design CAD: typed points in Mirror, Scale and Stretch', text: 'Mirror\'s two points, Scale\'s base point and Stretch\'s base and second points can now be typed as coordinates (x,y), relative (@x,y), polar (@distance<angle) or a distance along the cursor, as in Move and Rotate. They used to give "Unknown command".', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.177', date: '2026-11-17',
    items: [
      { title: 'Design CAD: Space twice repeats the last command', text: 'When a command ends, the command line now says which one Space starts again, for example "Space repeats TRIM". In a command that keeps going, such as Trim or Offset, the first Space or Enter ends it and the second starts it again. Enter with nothing picked now also ends Mirror, Scale, Align, Array, Join, Draw order, Move, Rotate and the text tools, as it ends the other commands.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.176', date: '2026-11-17',
    items: [
      { title: 'Design CAD: Move, Copy, Rotate, Mirror, Scale and Stretch show the result before the click', text: 'After the base point, every object picked follows the cursor dashed, and each device as its own symbol, faded, so you see where they go before you click. Mirror shows the mirrored copies along the mirror line, and Scale shows the objects at the factor while you type it. After the Stretch window, the drawn objects it caught look picked, with a square on each point that will move. Up to 2,000 objects show; above that, only the rubber line.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: rotate several objects at once', text: 'Rotate now works on several objects picked together. Drawn objects turn about the base point, devices move round it, and cameras and speakers also turn by the angle. Click the angle or type it in degrees.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.175', date: '2026-11-17',
    items: [
      { title: 'SLD: end boards side by side keep their frames apart', text: 'In DEWA style, two boards with no outgoing ways on neighbouring ways (a UPS board and a fire pump panel, say) no longer draw their dashed frames and text over each other: the second one moves right until its frame is clear, and so does a panel beside one. Drawings whose frames were already clear keep their places.' }
    ]
  },
  {
    version: '2.174', date: '2026-11-17',
    items: [
      { title: 'Design CAD: Trim and Extend show the result before the click', text: 'In Trim, the part a click would cut away fades and turns dashed as the cursor passes over a line, so you see what goes before you click. In Extend, the new length shows dashed up to the line it will reach, with a small cross where it meets it. Hold Shift to see the other one, as a Shift-click does. Both commands keep the pick box between clicks and mark only drawn lines, and are quicker on large drawings.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.173', date: '2026-11-17',
    items: [
      { title: 'SLD: Colour by → Supply', text: 'A new Supply choice under Colour by shows on screen which boards and cables are on emergency supply (red: on or below an emergency board or a board with a standby generator), on a UPS (blue) or existing (grey). Printed sheets, PDF and DXF stay black and white.' }
    ]
  },
  {
    version: '2.172', date: '2026-11-17',
    items: [
      { title: 'SLD: board symbols that show the kind of board', text: 'A board at the end of a feeder is now drawn as a 2:1 symbol whose pattern tells its kind: a diagonal for a DB, half filled for an SMDB, a cross for an emergency board, the top half filled for an MCC and a second frame for a main board. The risers, the Board tab, the legend and the equipment strip use the same symbols, existing boards are drawn dashed, and printed sheets no longer show the green check dot.' }
    ]
  },
  {
    version: '2.170', date: '2026-11-17',
    items: [
      { title: 'SLD: earth leakage drawn as on submission drawings', text: 'An ELCB is now drawn as its core-balance CT on the cable, wired to an ELCB box with the sensitivity above it, on its own row under the breaker. RCCB and ELR written in the remarks use the same box with their own word. Only an RCBO stays in the breaker symbol, with its toroid inside it. The breaker text names the device that is drawn (RCBO, ISOLATOR) and no longer repeats the mA.' },
      { title: 'SLD: larger breakers', text: 'Breakers and switches on the System diagram are drawn 1.5 times larger, so the × and the contacts read clearly; the text stays where it was.' }
    ]
  },
  {
    version: '2.166', date: '2026-11-17',
    items: [
      { title: 'Design CAD: taken-over notes, ellipses, hatches and dimensions stay themselves', text: 'When an object of an opened drawing is taken over for editing, its paragraph text becomes a note, an ellipse an ellipse, a patterned hatch keeps its pattern, and a dimension becomes a drawn dimension. Splines become polylines, and the command line says so.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.165', date: '2026-11-16',
    items: [
      { title: 'Design CAD: edit the objects of an opened drawing', text: 'The first edit of an object of the drawing you opened (Move, Rotate, Scale, Offset, Trim, a grip drag, a property…) takes it over as a drawn object with the same layer, colour, linetype, lineweight and arcs; one ⌘Z undoes both the take-over and the edit. Copy keeps the original and adds a drawn copy. An object on a locked layer is refused. The drawing file itself changes only when you save.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: window and crossing picks find the drawing\'s objects', text: 'A window or crossing now picks the objects of the opened drawing as well as the ones drawn here, and Select similar finds the drawing\'s objects of the same kind and layer. Their right-click menu, floating toolbar, grips and Properties work as for drawn objects.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: polylines with arcs', text: 'Polylines with arc segments are drawn, snapped, measured, mirrored and saved with their arcs; Explode gives lines and arcs. Offset, Trim, Extend, Break, Fillet, Chamfer and Join ask you to explode them first.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: saved objects keep their own colour, linetype and lineweight', text: 'Save DXF and Save DWG write each drawn object\'s own colour, linetype and lineweight, not only its layer\'s.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.164', date: '2026-11-16',
    items: [
      { title: 'Design CAD: right-click menus with icons and one order', text: 'Every right-click menu now shows the ribbon\'s icon for each tool, its shortcut or typed command on the right, and a header naming what is picked. Picked objects get one order everywhere: the object\'s own tools, clipboard and undo, modify, view, select, then Properties and Options. A line\'s own tools are under Line tools, electrical tools show in amber, and Copy (CO) is now Copy selection.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: Invert selection and Zoom to selection', text: 'SELECTINVERT picks everything that was not picked and drops what was. Z O zooms to the objects picked. Both are also on the right-click menu.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: Undo says what it undoes', text: 'The right-click menu names the step, for example Undo Offset or Redo Move.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: right-click menus from the keyboard', text: 'Up and Down move over the rows, Right opens a list, Left closes it, Enter runs the row, Esc closes the list and then the menu, and a letter jumps to the next row that starts with it. Shift+F10 or the menu key opens the menu at the objects picked.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.163', date: '2026-11-16',
    items: [
      { title: 'Design CAD: right-click menus stay inside the drawing', text: 'A right-click near the bottom or right edge of the drawing now opens the menu upward or to the left, so every entry can be reached; a menu taller than the drawing scrolls. A list opens beside its row, and to the left at the right edge.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.162', date: '2026-11-16',
    items: [
      { title: 'Design CAD: adjust a revision cloud\'s arcs', text: 'REVCLOUD now has an Arc option: choose it, type the arc length in drawing units, then draw the cloud. To change a cloud already drawn, pick it and edit Geometry → Arc length in Properties.', action: 'cad' }
    ]
  },
  {
    version: '2.161', date: '2026-11-16',
    items: [
      { title: 'Design CAD: clip a viewport to an outline', text: 'A viewport on a layout can now have any outline, not only a rectangle. Pick the viewport, then Output → Layout viewports → Clip (VPCLIP) and click the corners of the outline on the paper; Enter closes it, U takes the last corner back, Esc cancels. The plan is cut at the outline on screen, in the plot and in the PDF, and the outline is what prints as the frame when Frame prints is on. Remove the outline (VPCLIP D) makes it a rectangle again. It works on plan sheets and on layouts made with +, from the ribbon, the viewport\'s right-click menu and its properties, and a layout template keeps it.', action: 'cad' }
    ]
  },
  {
    version: '2.160', date: '2026-11-16',
    items: [
      { title: 'Design CAD: picked objects show on any colour', text: 'A picked drawn object is drawn dashed in its own colour over a blue halo, so it shows on any layer colour. The same for the objects of an opened drawing, and a picked text of an opened drawing now gets a box.' },
      { title: 'Design CAD: grips that suit the object', text: 'Squares for points, bars for the middle of a side, diamonds for sizes. A circle shows its centre and four quadrants, an arc its centre, ends and middle. Grips show on every picked object, up to 100.' },
      { title: 'Design CAD: Mirror from a hot grip', text: 'Click a grip, then right-click it: Mirror through this point, next to Move, Copy and Rotate.' },
      { title: 'Drafting settings: picked look and grip limit', text: 'Drafting settings → Selection: the look of picked objects, the selection colour, and how many picked objects show grips.' }
    ]
  },
  {
    version: '2.159', date: '2026-11-15',
    items: [
      { title: 'Busbar riser: one maximum demand', text: 'The busway, its breaker and the Load schedule\'s Busbar riser form now use the same maximum demand: each tap-off board\'s MD from its MD form (TCL × DF). Risers whose floors are boards may get a bigger busway and breaker; check them.' },
      { title: 'Busbar riser: diversity you choose', text: 'Choose the riser diversity: same as the MD forms (1.0, the default when every floor is a board), IEC 61439 by tap-offs (the default for loads entered on the page), or typed. A diversity below 1.0 shows as its own row on the Busbar riser form.' },
      { title: 'Busbar riser: D.F check', text: 'When a board\'s circuits draw more than its MD form shows, the riser names that board in its notes, so you can check the D.F on its form.' },
      { title: 'Busbar riser: tap-off unit at least its MCCB', text: 'A tap-off unit is never smaller than the breaker inside it.' },
      { title: 'Boards by level: busway breaker', text: 'The busway\'s breaker now shows the feeding breaker. It showed the busway rating.' },
      { title: 'G+10 mock-up: tap-off breakers', text: 'The mock-up\'s tap-off breakers are sized to each floor.' }
    ]
  },
  {
    version: '2.158', date: '2026-11-15',
    items: [
      { title: 'SLD: equipment on the Board tab', text: 'The equipment strip is now on the Board tab too. Drop an item on the board\'s busbar for a new way, where the marker shows, or on one of its ways for a breaker, meter, RCD, isolator, cable type or starter. The lists show only what that board can take, and the view stays on the board after a drop, also when you add a sub-board. Supply and Devices on the ribbon place on the Board tab as well.' }
    ]
  },
  {
    version: '2.157', date: '2026-11-15',
    items: [
      { title: 'SLD: the equipment library is a thin strip', text: 'The equipment library is now a thin strip at the edge of the drawing instead of the side panel\'s Equipment tab: search, your favourites and recent items, then one symbol per category. Click a symbol for its list, then click an item and click the drawing, or drag it. The list closes after a pick; its pin keeps it open. The button at the foot of the strip moves it to the other side. The side panel shows the panels again.' }
    ]
  },
  {
    version: '2.155', date: '2026-11-15',
    items: [
      { title: 'The authority stays with the project', text: 'The authority is chosen when a project starts. On Standards → Design references, a rule set of another authority now shows Change authority…: it names the authority the project is under and needs a tick before it is applied. Rule sets of the same authority apply as before.' }
    ]
  },
  {
    version: '2.154', date: '2026-11-15',
    items: [
      { title: 'Sheets: push a panel schedule to the load schedule', text: 'Push to load schedule now works for a panel schedule (MDB, SMDB, MCC) as well as a DB schedule. A row that names a panel (SMDB-1, DB-GF) makes that panel under it, other rows become feeders, and SPARE and SPACE rows become spares. An INCOMER row sets the panel\'s incomer. A panel\'s load comes from its own schedule, so push those sheets too.', action: 'sheets' },
      { title: 'Sheets: SPARE and SPACE rows of a DB schedule', text: 'A row of a DB schedule that reads SPARE or SPACE and has no load now becomes a spare way or a space at its circuit reference, as in the DB\'s own schedule, not a circuit named SPARE. Pushing the sheet again updates it.', action: 'sheets' }
    ]
  },
  {
    version: '2.151', date: '2026-11-15',
    items: [
      { title: 'Bring your own AI: the MCP connection comes with the installed app', text: 'The installed app now carries its command line (lvds) and its MCP server, so your own AI program (any MCP client, or a free local model through one) can read and check your projects on this computer. The app has no AI of its own and holds no account or key. To connect, run lvds mcp-config from the app\'s resources folder (the README gives the command for macOS and Windows) and paste what it prints into the MCP settings of your AI program. It is read only unless you add --write, and then every change is previewed first.' },
      { title: 'Command line without Node', text: 'The lvds command of the installed app is run by the app itself, with no window: nothing else needs installing. Its PDF reports and drawing sheets are made by that same app, wherever you installed it.' }
    ]
  },
  {
    version: '2.150', date: '2026-11-15',
    items: [
      { title: 'Projects: saved as .lvds files', text: 'Projects are now saved as .lvds files, with the same content as before. Older .json projects still open; their next save writes a .lvds and keeps the .json as its backup (name.lvds.bak). Double-click a .lvds to open it in the app.' },
      { title: 'Project tab: Export JSON', text: 'Export JSON saves the open project as a plain .json file, for scripts and other programs. From the command line: lvds project-json <project>.' },
      { title: 'Beta downloads for Windows and Mac', text: 'The About page of the LV Design Studio website now shows screenshots of the app, and its Download page offers unsigned beta installers for Windows x64 and Apple-silicon Macs. A beta build tells you when a newer beta is out; it never downloads or installs one itself.' }
    ]
  },
  {
    version: '2.149', date: '2026-11-15',
    items: [
      { title: 'Design CAD: Layout manager', text: 'Output → Layout → Layout manager (LAYOUTMANAGER) lists every layout of the drawing in one place: the drawing file\'s own, the ones made with + and the level\'s plan sheets, each with its paper, what it shows and its page setup. Tick layouts to copy or delete several at once, rename one, move it up or down, or give a named page setup to several plan sheets together. A double-click opens a layout. It is also on a layout tab\'s right-click menu.', action: 'cad' },
      { title: 'Pen tables: named plot styles (STB)', text: 'Pen tables → Import CTB / STB… now takes an STB file as well. Its named styles come in with the table, and a new Plot style column gives one to each kind of line: the line takes that style\'s width and screening.' },
      { title: 'Pen tables: screening from a CTB file', text: 'Importing a CTB file now reads each colour\'s screening as CAD programs write it. Before, the screening was missed and every colour came in at full black. A width that is not in the usual list (0.09, 0.30, 0.53 mm) now shows in the table too. Import the file again to get its screening.' }
    ]
  },
  {
    version: '2.147', date: '2026-11-15',
    items: [
      { title: 'Design CAD: your design on the drawing\'s layouts', text: 'A layout of the drawing — one made with + or the drawing file\'s own — now shows what you made in the app through its viewports, as the Model tab does: devices, DBs, wiring and home runs, cable trays and routes with their tags, and the lines, text, dimensions and hatches you drew. Before, it showed the drawing file\'s own lines and text only. Plot prints the same. Symbols and tags keep their size on the paper at any viewport scale, as on a plan sheet; a small key plan viewport leaves the tags out.', action: 'cad' },
      { title: 'Design CAD: layouts from a drawing template', text: 'New layout → From another drawing… now takes a drawing template (DWT) as well as a DWG or DXF.', action: 'cad' },
      { title: 'Design CAD: key plan at the right scale', text: 'Arrange → Plan and key plan on a layout made with + now sets the key plan from the plan\'s scale (a plan at 1:75 gets a key plan at 1:500). It used to come out far too small.', action: 'cad' }
    ]
  },
  {
    version: '2.146', date: '2026-11-14',
    items: [
      { title: 'Design CAD: dimension text centred in saved files', text: 'In a DXF or DWG saved from Design CAD, the text of a dimension you drew is now centred where the app and the sheets show it. Other CAD programs used to show it starting at that point, half its width to one side.' }
    ]
  },
  {
    version: '2.145', date: '2026-11-14',
    items: [
      { title: 'Design CAD: your own text at its real height', text: 'Text, notes, dimensions and tray, cable and fitting labels drawn in Design CAD now have their capitals at the height you set, as other CAD programs show them in the DXF or DWG you save. Before, their capitals came out at about 0.7 of it, so text already in a drawing now shows about 1.4 times taller: check for labels that run into something.', action: 'cad' },
      { title: 'Plan sheets: text at its real height', text: 'On the plan sheets and their PDF, text 2.5 mm high prints with capitals 2.5 mm high, as the ISO text heights mean. Tray and cable labels print with 2.5 mm capitals too, and stacked cable tags are spaced to match.' }
    ]
  },
  {
    version: '2.144', date: '2026-11-14',
    items: [
      { title: 'Design CAD: typed shortcuts as in other CAD programs', text: 'TR is now Trim and LA opens the layer palette; Trace a room is TRACE and the side Layers list is LAYERS. AL or ALIGN moves, turns and, if you choose, scales the drawn objects picked by one or two pairs of points (lining up devices is ALIGNH, ALIGNV and SPACE). MA matches a device, or the properties of a drawn object clicked first. New short names: PT, RC, N, SA, OR, SN, EXP, AE, AT, BC, BS, -B, -I, ISOLATE and UNISOLATE; PR or CH open the properties palette, PP or PRINT plot, OP opens the Drafting settings and UN its Units tab, and RE or REGEN are accepted.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.143', date: '2026-11-14',
    items: [
      { title: 'Design CAD: viewports on a layout made with +', text: 'On a layout made with +, a viewport is picked by its frame: drag the frame to move it, drag a corner to resize it. Viewport (MV) makes a new one from two corners; Esc stops it. A double-click inside works in it: the wheel and a drag then move its view, and a double-click outside goes back to the paper (MS and PS, or the PAPER / MODEL button on the status bar). Scale, Lock, Fit, Copy, Align, Maximise and Frame prints act on the viewport picked; its properties show in the palette, and the same entries are on its right-click menu.', action: 'cad' },
      { title: 'Design CAD: layouts from another drawing', text: 'Output → Layout → New layout → From another drawing… (LAYOUT I) lists the layouts of a DWG or DXF file. The ones you tick are added to this drawing with their paper and their viewport frames at their scales; the viewports show this drawing. They can be kept as layout templates too. It is also on a layout tab\'s right-click menu.', action: 'cad' },
      { title: 'Design CAD: plot any layout', text: 'Plot now works on a layout made with + and on the drawing file\'s own layouts: a PDF on the layout\'s own paper (A4 to A0, either way up) or a printer (A4 to A1), black on white, with a preview first. A viewport\'s frame prints only where Frame prints is on. Plot is on the Output tab, the layout tab\'s right-click menu and the paper\'s.', action: 'cad' },
      { title: 'Design CAD: layers on layouts', text: 'A layer of the drawing turned off or frozen in the app is now hidden on the drawing\'s layouts and on their plots too, as it is on the Model tab.', action: 'cad' }
    ]
  },
  {
    version: '2.142', date: '2026-11-14',
    items: [
      { title: 'Design CAD: text at its real height', text: 'Text in an opened drawing is drawn with its capitals at the height the drawing gives, as other CAD programs show it. Text fitted to a width, as in drawings exported from the SLD, no longer looks squashed, and it keeps its shape when you zoom in close.' },
      { title: 'Design CAD: text stays visible zoomed out', text: 'Text too small to read when you zoom out shows as a faint bar where its words are, as in other CAD programs, instead of disappearing. This covers the opened drawing, your own text and notes, and a file\'s layouts.' }
    ]
  },
  {
    version: '2.140', date: '2026-11-14',
    items: [
      { title: 'Sheets: push an existing schedule to the load schedule', text: 'Open an existing Excel DB schedule in Sheets and link its columns: Link columns then says how many rows of its own the sheet has and offers Push to load schedule. Push makes the panel under its Fed from board (and that board too, when it is not in the project) and one circuit for each row, so the Load schedule tab and the SLD follow. A circuit number such as R1 or Y2 sets the phase and way; a size left blank is sized by the rules and a typed one is kept; pushing the same schedule again updates its circuits. Use as a template only keeps just the layout.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.139', date: '2026-11-14',
    items: [
      { title: 'Load schedule: PDF in your own format', text: 'Export on the Load schedule tab has PDF: my format for the panel on screen, and PDF: my format, all panels for every panel that has a format of yours, one page each in one file. The page is your template as you laid it out, filled from the project, in black and white with its own borders and merged headings, on A4 landscape fitted to the page width.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.138', date: '2026-11-14',
    items: [
      { title: 'Sheets: the sheet tabs stay on one row', text: 'With many sheets the row of sheet names under the grid no longer grows line after line: it stays one row that scrolls sideways and keeps the shown sheet in view, a long name is shortened, and with more than eight sheets a list beside it jumps straight to one.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.137', date: '2026-11-14',
    items: [
      { title: 'Sheets: your own schedules for MDB, SMDB and MCC', text: 'Link columns now asks whether a sheet is a DB schedule or a panel schedule. A panel schedule has one row per outgoing feeder: name, device, rating, cable, load per phase, TCL and MDL fill from the project, and what you type — or a new feeder row — goes back with Apply to project. My formats keeps panel layouts too, and a project can use a different format for its DBs, SMDBs, MDBs and MCCs, chosen with the new project or in My formats. Export → Open in my format works on a panel\'s form as well.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.136', date: '2026-11-14',
    items: [
      { title: 'Design CAD: layout tools on Output', text: 'Output now reads Layout · Layout viewports · Plot · Publish · Export, with every tool named. New layout lists a layout of the drawing, one from a template, and the four plan sheets; Page setup and Save as template are beside it. The viewport tools show on a layout tab. With Show labels on, the two layout panels have a Layout sub-tab of their own beside Output.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: arrange viewports', text: 'Arrange (VPORTS) lays a layout\'s viewports out as one, two side by side or stacked, three with a large one, four equal, or a plan with a key plan, with a 5 mm gap. Viewports already there keep their scale and view. It works on plan sheets and on layouts made with +, and is on the paper\'s right-click menu too.', action: 'cad' },
      { title: 'Design CAD: more viewport tools', text: 'Fit shows the whole level at the nearest scale of the list; Copy puts a copy beside the viewport; Align lines its view up with Viewport 1; Maximise shows its area on the Model tab (VPMIN or the layout\'s tab comes back); Frame prints switches its frame on the print. Scale list… (SCALELISTEDIT) adds scales such as 1:25, 1:75 and 1:150, or your own, to this project.', action: 'cad' },
      { title: 'Design CAD: paper for a layout made with +', text: 'Page setup on a layout made with + sets its paper, A4 to A0, landscape or portrait. Its viewports keep their place and scale. It is on the Layout panel, the layout tab\'s right-click menu and the paper\'s.', action: 'cad' },
      { title: 'Design CAD: layout templates', text: 'Save as template keeps a layout\'s paper, where its viewports sit, their scales and a plan sheet\'s legend and notes tables in your library, for every project. New layout → From template… makes a layout of the drawing or a plan sheet of the level from one. Templates can be exported to a file and imported from one. A drawing file\'s own layout can be saved as a template too.', action: 'cad' },
      { title: 'Page setups: import, export and a library', text: 'Output → Page setups has Import… (a page-setup file, or another project file), Export…, Save to library and Add from library. A page setup brings its pen table with it; one whose name is already in the project is left as it is.', action: 'cad' }
    ]
  },
  {
    version: '2.134', date: '2026-11-14',
    items: [
      { title: 'Your DB schedule format, chosen with the project', text: 'A new project can start with one of your formats for its DB schedules, beside the authority and rule set; an open project takes one in Sheets → My formats → Use for this project. On the Load schedule tab, Export → Open in my format then shows the DB as a sheet in that layout, making the sheet when there is none. The project keeps its own copy of the format, so a later change in My formats reaches it only when you update the copy.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.133', date: '2026-11-14',
    items: [
      { title: 'Sheets: save your layout as a format', text: 'In Link columns, Save as my format keeps a linked layout in your office library. On the Electrical tab, My formats adds a sheet in that layout for any board, or for every DB that has none, in this and in every other project. Formats travel with Library.json like your other libraries, and can be renamed or deleted there.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.132', date: '2026-11-14',
    items: [
      { title: 'Sheets: schedule in your own sheet', text: 'In a sheet linked to a DB you can now type the description, load, points, MCB, cable, length and remarks. Typed values are marked and kept until you press Apply to project on the Electrical tab; the project, the Load schedule tab and the SLD then follow. Add circuit adds a row for a new circuit: with the MCB and cable left blank, the app sizes them by the rules. A typed size that fails its check is marked before you apply. Refresh from project drops what was not applied.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.131', date: '2026-11-14',
    items: [
      { title: 'Sheets: link your own schedule to a DB', text: 'On the Electrical tab, Link columns says which cell of your sheet holds the panel number and Fed from, and which column holds the circuit reference, load, MCB, cable and so on; Suggest links reads them from your headings. Choose a board and the sheet fills from the project, one row per circuit, and stays up to date. A column of your own keeps its text with each circuit. One click adds a sheet for every other DB. Linked cells are read only for now; typing in them comes with Apply to project.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.130', date: '2026-11-14',
    items: [
      { title: 'Sheets: merged cells and borders', text: 'An Excel file opened in Sheets keeps its merged cells and its borders (thin or thick), shows them in the grid and has them again when saved. Merge cells and Borders on the Home tab now work. Border colours and dash patterns are not kept.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.129', date: '2026-11-14',
    items: [
      { title: 'Load schedule: forms name the project\'s authority', text: 'A new main board, and a supply with no Fed from of its own, now take the authority the project started with (ADDC, EtihadWE …) on the Connected load & MD form, the TCL summary and the Excel forms, in place of the fixed word DEWA. A project with no authority set keeps DEWA. The two point-column sets are named Villa and Standard.' }
    ]
  },
  {
    version: '2.128', date: '2026-11-14',
    items: [
      { title: 'Design CAD: Annotate has its own sub-tab', text: 'Text, Dimension, Leader, Room tag, Keynote, North arrow, Revision cloud, Text style and Dim style moved from LVCAD to Annotate, the sub-tab beside it. On a layout\'s paper, and on a sheet with Show labels on, Annotate has the markup tools. Typing an annotation command, such as T or DIM, opens Annotate.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: tool names no longer overlap', text: 'When the window is too narrow for a Design CAD row, its last panels fold into one button each, with their tools in its list, instead of the tool names running into each other.', action: 'cad' }
    ]
  },
  {
    version: '2.127', date: '2026-11-13',
    items: [
      { title: 'SLD CAD export: symbols as blocks', text: 'Breakers, switches and the other library symbols in exported DXF and DWG drawings are now blocks, one definition per symbol inserted wherever it is used, so they can be selected, counted and replaced in CAD.' }
    ]
  },
  {
    version: '2.126', date: '2026-11-13',
    items: [
      { title: 'SLD CAD export: notes and title block as printed', text: 'In exported DXF and DWG sheets, notes, schedules and title block text now have the same size and line spacing as the PDF, so the lines no longer crowd each other.' }
    ]
  },
  {
    version: '2.125', date: '2026-11-14',
    items: [
      { title: 'Design CAD: edit a hatch', text: 'HE (or a double-click on a hatch) edits it: pattern, spacing, angle, the pattern\'s origin and its islands, each change one undo step. The Hatch arrow on the Draw panel has Edit hatch and Boundary.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: islands', text: 'A hatch leaves the closed objects inside it clear. Turn Find islands off on the Hatch panel to fill the whole outline; Add islands and Remove islands change them later. Its area is the net area.', action: 'cad' },
      { title: 'Design CAD: associative hatches', text: 'A hatch made from a drawn object follows it when you move, stretch or reshape it, and lets go (keeping its shape) when the object is erased or opened. Right-click → Recreate boundary ties one to new outlines.', action: 'cad' },
      { title: 'Design CAD: set the pattern\'s origin', text: 'Right-click a hatch → Set origin, or Pick… in the Edit hatch panel, starts the pattern at a point you click. Moving, rotating, scaling or mirroring a hatch keeps its pattern with it.', action: 'cad' },
      { title: 'Design CAD: Boundary', text: 'BO draws a closed polyline round the area you click (a circle stays a circle), with one for each island. Areas closed by drawn lines work too, and Hatch finds them as well.', action: 'cad' },
      { title: 'Design CAD: pattern swatch, Export .pat and patterns on this computer', text: 'The Hatch panel shows a small swatch of the pattern chosen, Export .pat… saves every pattern in the list, and a tick keeps imported patterns on this computer for every project.', action: 'cad' },
      { title: 'DWG and DXF: hatches keep their pattern name', text: 'A saved hatch carries its real pattern name (ANSI31, BRICK…), angle and scale, its islands as separate boundaries, and, when associative, a link to the polyline it was made from.' }
    ]
  },
  {
    version: '2.124', date: '2026-11-14',
    items: [
      { title: 'Design CAD: no streaks along the bottom', text: 'After the drawing area got shorter, for example when the command line grew under it, zooming or panning could leave blue and green streaks along the bottom edge of the drawing that were not part of it. They no longer appear.' }
    ]
  },
  {
    version: '2.122', date: '2026-11-13',
    items: [
      { title: 'SLD CAD export: real dashed lines', text: 'Dashed frames and lines in exported DXF and DWG drawings are now single lines with a dashed linetype, not hundreds of short pieces, and rounded corners stay rounded.' }
    ]
  },
  {
    version: '2.120', date: '2026-11-13',
    items: [
      { title: 'Design CAD: fitted text in its place', text: 'Text fitted between two points, as in SLD drawings exported from the app, now opens in Design CAD at its own place and width instead of half its length to the right.' }
    ]
  },
  {
    version: '2.119', date: '2026-11-13',
    items: [
      { title: 'SLD CAD export: cable labels clear', text: 'In DXF and DWG drawings exported with cable references, the two lines of a DEWA cable label no longer run into each other.' }
    ]
  },
  {
    version: '2.118', date: '2026-11-13',
    items: [
      { title: 'Design CAD: cursor settings', text: 'Drafting settings (DS) → Cursor: choose the crosshair colour (Drawing ink, Accent or Cyan) and turn the outline under the cursor on or off. Selection: turn off the outline on what is under the pick box, or turn on a name tag that shows the object\'s kind and layer (a device\'s name) once the cursor rests on it for half a second.' }
    ]
  },
  {
    version: '2.117', date: '2026-11-13',
    items: [
      { title: 'Design CAD: window and crossing told apart', text: 'Dragging a selection window from left to right now draws it in blue with a solid edge and "Window" beside the cursor: it picks what is fully inside. From right to left it is green and dashed, with "Crossing": it also picks what it touches.' },
      { title: 'Design CAD: Shift shows + or −', text: 'With no command running, hold Shift over an object: a small + at the pick box means a click adds it to what is picked, a − means the click takes it off.' },
      { title: 'Design CAD: a hand while panning', text: 'While Space is held or the Pan tool is on, the cursor is an open hand; it closes while you drag. The middle mouse button shows the closed hand as it pans.' }
    ]
  },
  {
    version: '2.116', date: '2026-11-13',
    items: [
      { title: 'Design CAD: see what a click will pick', text: 'Before you click, the object under the pick box is marked with an amber outline: a line or other object of the drawing, something you drew, or a device. It is the object the click would pick; objects already picked stay green and are not marked. A grip under the pick box turns yellow and the box locks onto it, so you can see which grip you are about to take.' }
    ]
  },
  {
    version: '2.115', date: '2026-11-13',
    items: [
      { title: 'Design CAD: a clearer cursor', text: 'The cursor now shows what the drawing is waiting for. With no command running you see the crosshair and the pick box; while a command asks for a point, only the crosshair; while it asks you to select objects, only the pick box. The crosshair, the pick box and the snap markers have a thin outline in the background colour, so they stay visible over lines of any colour, and the crosshair stops just outside the pick box so you can see what you are about to pick.' },
      { title: 'Design CAD: the pick box is the click area', text: 'A click now picks what is inside the pick box. Before, the box was drawn 9 px wide while clicks reached 12 px. The box is now 12 px by default, so clicks reach as far as before. Change it in Drafting settings → Selection → Pick box size; the size you set changes both the box and the click area.' }
    ]
  },
  {
    version: '2.114', date: '2026-11-13',
    items: [
      { title: 'Ribbon no longer covers the page on a short window', text: 'In Design CAD the top of the Properties palette, and on the SLD page the tabs and bar above the drawing, could slide under the ribbon when the window was not very tall. Both pages now fit the room under the ribbon: the drawing area gets a little shorter instead.' },
    ]
  },
  {
    version: '2.113', date: '2026-11-13',
    items: [
      { title: 'Load schedule tools on MDB, SMDB and transformer forms', text: 'The Load schedule tab\'s ribbon now works on more than a DB\'s schedule. On the Connected load & MD form of an MDB, SMDB or MCC it adds feeders (and boards fed from the panel), 3-phase or 1-phase spares and spaces, fills down, copies, pastes, and edits, deletes or duplicates the selected row. On the TCL summary it adds transformers and substations, and edits or removes the selected transformer. Form details… is also under Export, and Edit on the Busbar riser opens the riser. The buttons on the pages themselves stay as they were.' }
    ]
  },
  {
    version: '2.112', date: '2026-11-12',
    items: [
      { title: 'Edit a block in place', text: 'In Design CAD, right-click a block you drew and choose Edit block in place (or pick it and type REFEDIT). Its objects come apart where the block stands, and the rest of the drawing fades and is locked, so you edit the block among what is around it. Draw, erase or change its objects; whatever you draw joins it. REFCLOSE then asks Save or Discard: Save redefines the block, and every insert of it shows the change; Discard puts it back as it was. Right-click empty space for Save back to the block or Discard changes. The drawing is not saved or exported until the edit is closed.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.111', date: '2026-11-12',
    items: [
      { title: 'Block editor', text: 'In Design CAD, right-click a block you drew and choose Open block editor, or type BEDIT and its name. The block opens as a drawing of its own, its base point at 0, 0 (marked on BE-REF, which is not part of the block): draw, erase and edit it with every tool, new objects going on layer 0 so each insert colours them by its own layer. BSAVE (or SAVE) saves it into the block, and every insert of it shows the change; BCLOSE closes the editor, asking first if there are changes not saved. Blocks inside the block show and can be inserted. An architect\'s block: right-click it and Copy as a block of this drawing first.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.110', date: '2026-11-12',
    items: [
      { title: 'Show on plan', text: 'Select a board or a circuit on the SLD and press Show on plan, after Delete in the Selection group. Design CAD opens that level\'s drawing, zooms to it and picks it: the board\'s symbol, the devices of the circuit, or its drawn cable route. A circuit with no route or devices shows the board it feeds when that is placed; otherwise the status line says what is missing.' },
      { title: 'Level and room on the SLD', text: 'The Values menu has a new tick, Level and room. It prints the level and room, for example Level 2 · Elec. room 2.01, under each DB and under each board drawn as a symbol, and in the standard style under the name box of a panel. DEWA-style panels already show them in their LOC row. A board with neither shows Not on a plan on the screen, and nothing on a sheet. Each drawing sheet has the same tick, off until you turn it on.' }
    ]
  },
  {
    version: '2.109', date: '2026-11-12',
    items: [
      { title: 'Load schedule ribbon: circuits, rows, balance, copy and export on the row', text: 'The Load schedule tab now holds the schedule commands that sat above the table and in the page header. Add circuit (the arrow beside it for a 3-phase circuit), Spare (with Space and the 3-phase ones) and Add load make up Circuits and loads. Rows has Fill down, Duplicate, Edit and Delete for the circuit you last clicked. Check, beside Run, goes to the next circuit that fails or needs checking, shows why with the fixes to apply, and moves on to the next board with a problem when this one is clean. Boards adds a panel, and Previous and Next board step through the panels in the schedule\'s order. Balance phases shows how far apart the phases are. Copy, Paste, Undo and Redo, and Export (Excel, PDF, CSV, the submission pack and your own Excel template) follow. Run shows how many studies are out of date, and on a narrow window the last groups wait under More. Documents → Load schedule now opens the Load schedule tab.' }
    ]
  },
  {
    version: '2.108', date: '2026-11-12',
    items: [
      { title: 'SLD ribbon: checks, supply, results, copy and export on the row', text: 'The SLD tab now holds the commands that sat elsewhere. Check, beside Run, counts the circuits that fail or need checking and goes to the next one; Run shows how many studies are out of date. Supply and Devices choose a transformer, generator, meter cabinet, breaker, meter or capacitor bank from the equipment library: pick one, then click the drawing. Results has Values, Colour by and Scenario with the setting in use beside each; they have moved up from the bar above the drawing, and so has Export. Copy, Paste, Undo, Redo and Fit are buttons too. On a narrow window the groups that do not fit wait under More.' }
    ]
  },
  {
    version: '2.107', date: '2026-11-12',
    items: [
      { title: 'HV supply and RMUs', text: 'In Panels → Transformers, enter the grid source from the authority (operator, voltage, fault level in MVA or kA, X/R) and each RMU’s ways, rated voltage, short-time rating, insulation, tee-off and owner. The grid fault level now lowers the LV fault levels and earth fault loop behind each transformer (before, the MV network was taken as infinite). Each RMU is checked for enough tee-off ways and for its rated voltage and short-time rating against the grid. The SLD shows the operator and fault level at the utility and the ways on the RMU box.' }
    ]
  },
  {
    version: '2.106', date: '2026-11-12',
    items: [
      { title: 'Right-click Object snap or Polar for their list', text: 'On the Design CAD status bar, right-click on Object snap now opens the list of running snaps, and on Polar tracking the list of angles, as the ▾ beside them does; each list ends with its settings. The other switches still open their Drafting settings tab.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.105', date: '2026-11-12',
    items: [
      { title: 'Right-click menus checked and completed', text: 'In Design CAD, the right-click menus were checked against the proposal. Right-click now works inside a layout of the drawing itself (its own Layout1, and those made with +): Show on the Model tab, Viewport scale, New layout, Rename, Copy and Delete. A layout tab\'s menu has New layout and, on plan sheets, Plot. Menus of drawn objects start with Repeat and end with Properties, and Clipboard has Cut (Ctrl+X, new command CUTCLIP). Dimension style now shows on a dimension\'s menu, Filter shows how many of each kind, ELV devices have Rotate, and a reference\'s Properties opens the References palette.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.104', date: '2026-11-11',
    items: [
      { title: 'Drawn objects stay true when you zoom', text: 'In Design CAD, the second and later objects you draw (lines, circles, arcs, polylines…) were drawn at a fixed size on the screen, with lines that grew thicker as you zoomed out. They now zoom with the drawing at their thin line, as the first one did.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.103', date: '2026-11-11',
    items: [
      { title: 'Right-click menus for texts, dimensions, hatches, polylines and grips, and Find and replace', text: 'In Design CAD, right-click a text for Find and replace, Justify, Text height, Case, Frame and Background mask; a dimension for Dimension style, Precision, Text position and Remove text override; a hatch for Hatch scale, Hatch angle and Recreate boundary; a polyline for Close / Open, Reverse direction, Explode, Use as room boundary, Convert to cable route, Join and Chamfer. Click a grip without dragging it and it turns hot: right-click then for Move, Copy or Rotate from that point, Add vertex, Remove vertex and Close / Open. New command FIND replaces words in every text, note, attribute and dimension text drawn here, any case, in one undo step.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.102', date: '2026-11-11',
    items: [
      { title: 'Right-click menus for blocks, references and layouts', text: 'In Design CAD, right-click a block you drew for Count instances, Replace with another block (the attribute values it shares are kept), Reset attributes and Explode. Right-click a block of the opened drawing for Count instances, Explode into drawn objects, Copy as a block of this drawing and Crop. Right-click a reference drawing\'s lines for Open reference, Clip, Fade, Reload, Unload, Detach, Bind, Print on sheets and its layers. On a layout, right-click inside a viewport for Activate, Show on the Model tab, Viewport scale, Lock display, Frame prints, Viewport layers and Erase viewport; right-click the paper for New viewport, Legend and Notes tables, the sheet\'s Issue status, Sheet list, Plot and Page setup.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.101', date: '2026-11-11',
    items: [
      { title: 'Right-click menus for devices, boards, rooms, trays and cable routes', text: 'In Design CAD, right-click a light or socket for Circuit (with Draw home-run), Swap device type, Select same circuit or type, Show in load schedule and Show in SLD. Right-click a board for Open board, Load schedule, Show in SLD or riser, Select all fed devices, Draw home-runs (its circuits on this level), Rename and Feeder cables. ELV devices offer Swap device, Select same type and Show in ELV schedule. Right-click inside a room with an outline for Room ▸: Light room, Lux check (lights placed against those needed), Emergency lighting, Fill with an ELV device, Select devices in room, Room loads (W/m² × area and demand), Area, Rename room and Room type. A cable tray offers Size tray from cables, Fill ratio check and Cables in this route; a cable route offers Trace circuit and Show in SLD; both can be reversed.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.100', date: '2026-11-11',
    items: [
      { title: 'A short breaker list in the load schedule', text: 'Clicking an MCB rating in the load schedule (circuits and spare ways) now opens a small grid of ratings under the cell, four to a row, instead of a tall list that ran up the screen. Arrow keys move, Enter picks and Esc closes without a change. You can still click the cell and type a rating, and copy, paste and fill-down work as before.' }
    ]
  },
  {
    version: '2.099', date: '2026-11-11',
    items: [
      { title: 'Right-click menus that fit what you click', text: 'In Design CAD, right-clicking empty space now opens a full menu: Repeat and Recent commands, Paste, Undo and Redo, Isolate, Pan, Zoom, Select all, Quick select, Count, Place device, Cable route and tray, Properties and Options. While a command runs, Shift+right-click (or right-click when the prompt has options) adds Recent input, Snap overrides for the next point (endpoint, midpoint, centre…), and the Ortho, Polar and Object snap switches. Objects picked add Isolate (show only these, hide these, end isolation), Add selected, Quick measure, Count and Deselect all. New commands behind them: PAN, UNDO, REDO, SELECTALL (Ctrl+A), COUNT, ISOLATEOBJECTS, HIDEOBJECTS, UNISOLATEOBJECTS, ADDSELECTED and QUICKMEASURE.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.098', date: '2026-11-11',
    items: [
      { title: '+ under a drawing makes a layout of it, as in other CAD work', text: 'In Design CAD, + beside the layout tabs now makes Layout2, Layout3… straight away: A3 paper with one viewport showing the whole drawing at a standard scale. No level is needed. Right-click a layout to rename, copy, move or delete it. The plan sheets of a level (Lighting E-LTG, Power E-PWR, ELV, Containment) are made from the right-click menu of any tab, or LAYOUT L / P / E / C.' }
    ]
  },
  {
    version: '2.097', date: '2026-11-11',
    items: [
      { title: 'Cable and breaker limits you can change', text: 'Standards → Design references now shows the cable / breaker limit tables (DEWA Appendix 5, Tables 1–3) under Rule rows. Duplicate DEWA, or use a reference built on it, to change any row, the DB feeder minimum, the cable types a table covers, or add tables of your own. Choose to size cables up, warn only, or switch the limits off. Apply the reference to use them in the project.' }
    ]
  },
  {
    version: '2.096', date: '2026-11-11',
    items: [
      { title: 'A drawing\'s own layouts now show their paper; + on every drawing', text: 'Opening a layout saved in the drawing file (Layout1…) showed an empty screen: its paper, printable area and viewports now show. The + for a new layout is there on every drawing; in a project with no levels yet it says to add them in Building information first, as each layout is a plan sheet of a level.' }
    ]
  },
  {
    version: '2.095', date: '2026-11-11',
    items: [
      { title: 'DEWA cable and breaker limits (Appendix 5, Tables 1–3)', text: 'On DEWA projects, automatic sizing now also meets the DEWA cable selection tables: each size has a largest breaker and load. Table 3 for armoured XLPE cable (for example 25 mm² up to 80 A, 35 mm² up to 100 A), Table 2 for armoured PVC (new cable type PVC/SWA/PVC) and Table 1 for single-core PVC wires in conduit (new cable type PVC 1C; DB load schedule circuits use it unless another type is set, for example a 40 A single-phase circuit needs 10 mm²). 2.5 mm² may carry 16 A. Parallel runs count as runs × the table value. When a table, not the calculation, sets the size, the circuit gets a remark such as "DEWA Table 3: 35 mm² for 100 A (25 mm² max 80 A)"; your own remarks are kept. A feeder to a DB is at least 10 mm² on a 40 A breaker. A size set by hand that breaks a table fails the checks, with fixes offered. The sample project is resized to meet the tables.' }
    ]
  },
  {
    version: '2.094', date: '2026-11-11',
    items: [
      { title: 'Status bar switches as icons, with snap modes and polar angle a click away', text: 'At the bottom of Design CAD, grid, snap, ortho, polar tracking, object snap, object snap tracking, dynamic input and lineweights are now icons in groups, lit when on; the tooltip gives the name and function key. The small ▾ beside object snap lists the running snaps (endpoint, midpoint, centre…) to tick on or off at once, and the ▾ beside polar picks the tracking angle (90°, 45°, 30°…). Right-click still opens each one\'s Drafting settings.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.093', date: '2026-11-11',
    items: [
      { title: 'Model and layout tabs on every drawing, with the drawing\'s own layouts', text: 'Every drawing opened in Design CAD now has the Model tab and a tab for each layout saved in the file itself (Layout1, A1 Lighting…), as in other CAD work, whether or not it is tied to a level. A layout tab shows its paper with the printable area from its page setup, trim marks, what is drawn on the paper (title block, notes) and the model through each viewport at its scale, in black on white; the status bar gives the paper size and viewport scales. The wheel zooms, a drag pans. These layouts are shown as saved; to change them, use the project\'s plan sheets, still in the same tab strip (marked sheet). Saving the drawing keeps its layouts.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.091', date: '2026-11-11',
    items: [
      { title: 'Layout paper shows its printable area and trim marks; command bar above the tabs', text: 'On a layout tab in Design CAD, the paper now shows a dashed line 5 mm in from its edge where a printer can print, and trim marks outside its four corners. Both are on screen only and never plotted. The command bar now sits directly above the Model and layout tabs, with the status bar at the very bottom, as in other CAD work.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.089', date: '2026-11-11',
    items: [
      { title: 'Revision cloud and callout text shows at its true size', text: 'On Electrical, ELV and SLD sheets, the revision letter in a cloud’s triangle and the text of a callout or note now show on screen at their set letter height and markup colour, inside the triangle and the callout box, the same as on the printed sheet. Before, they showed too large and grey, and spilled out of the triangle and box.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.088', date: '2026-11-11',
    items: [
      { title: 'Earthing schematic prints larger, and continues on more sheets when it must', text: 'The printed earthing schematic now also tries narrower substation rows (a wide substation on two rows), which lets more columns fit: a big site prints up to about a third larger. When even that would print labels under 2 mm, the schematic continues over several sheets of whole rows, each its own numbered sheet in the drawing set (E-ERT-001, -002 …) with "continued on" notes; a link to a pit on another sheet names that sheet, and the pit schedule goes on the last sheet. Auto paper goes up to A1 before adding sheets. Add earthing schematic in Drawings adds any missing sheets, and the set checks say when the count changed.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.087', date: '2026-11-10',
    items: [
      { title: 'Earthing schematic fills the sheet', text: 'On the printed earthing schematic (PDF, DXF and Design CAD → Sheets), the substation bands no longer stand in one tall column. Whole bands flow into side-by-side columns, and a long earth pit schedule gets a column of its own, whichever prints largest on a landscape sheet. A site with many substations prints about twice the size. The drawing inside each band is unchanged, and so is the on-screen Earthing view.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.086', date: '2026-11-10',
    items: [
      { title: 'Boards with no outgoing ways drawn as a board symbol', text: 'On the SLD, a board with nothing below it yet now ends its incoming line on a board symbol (busbar and ways inside; one way for a DB, control rows for a package panel), with its name, kind and loading beside it and "NO OUTGOING WAYS" or its load-schedule circuits underneath, inside a dashed panel frame in DEWA style like the other panels. No more line running past the box.' },
      { title: 'Tidier earthing with several transformers', text: 'Each transformer\'s LV earth-pit detail now stands next to its own incomer: the electrode note is on two lines, the test link sits by the incomer, and the MET no longer runs through the "415 V" label. SLDs with many transformers are narrower.' }
    ]
  },
  {
    version: '2.085', date: '2026-11-10',
    items: [
      { title: 'New drawing in Design CAD', text: 'File → New (NEW) opens a blank drawing in millimetres in a tab of its own, Drawing1.dxf, Drawing2.dxf… — also from the page with no drawing open. Save As names it the first time.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Grid on from the start', text: 'Design CAD opens with the grid showing (F7 still steps lines → dots → off).' }
    ]
  },
  {
    version: '2.084', date: '2026-11-10',
    items: [
      { title: 'Approved makes, specification references and preambles in the BOQ', text: 'BOQ → Makes & preambles: up to three approved makes and a specification clause per equipment category (MCCB, cables, tray, luminaires…), and a preamble for the bill and each section. Save it as an office list and load it on other projects; a line can have its own makes in its pencil dialog. The Excel BOQ gains Spec ref. and Approved makes columns after Location, and the PDF prints them under each description.' }
    ]
  },
  {
    version: '2.083', date: '2026-11-10',
    items: [
      { title: 'Block attributes: tags you fill in on insert and edit with a double-click', text: 'ATT (ATTDEF), or Attribute on the Blocks panel, draws an attribute definition: a tag, the prompt and a default, with the text\'s justify, style, height and rotation, and its modes (invisible, constant, verify, preset, lock position, multiple lines). Make a block with it among the objects: inserting the block then asks each prompt on the command line with its default (or in one dialog, when Drafting settings → Dynamic input has Attribute prompts in a dialog ticked), and the values show where the tags sat. A double-click on such a block, ATE / EATTEDIT, or Edit attributes on its right-click menu opens the Edit attributes dialog: the values, the text options and the block\'s layer and colour; OK, Cancel, Apply. The Properties palette lists the values too. ATTEXT, or File → Export → Block attributes, writes every attribute of every block as a table (Excel or CSV): block, tag, value, layer, position, and the feeder a CIRCUIT value names. Attributes save to DXF and DWG as ATTDEF and ATTRIB entities.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.082', date: '2026-11-10',
    items: [
      { title: 'Insert blocks: the Blocks palette (I)', text: 'I (INSERT), or Insert on the Blocks panel, opens the Blocks palette beside the drawing: Current drawing (this drawing\'s blocks, and the architect\'s), Recent (the twelve inserted lately) and Library (Folder… chooses a folder of DWG / DXF files, each one block). Search, pick a block, then click where it goes, or drag it onto the drawing; set its scale and rotation, Repeat placement for several, Explode to place its objects instead. Insert\'s arrow lists the drawing\'s blocks by name; -INSERT takes the name on the command line, with Scale and Rotate. DIVIDE and MEASURE now take Block: a block at each point, aligned with the object or not. INSERT and I no longer add a device: DEV and DEVICE do, as the ribbon\'s device buttons always did.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.081', date: '2026-11-10',
    items: [
      { title: 'Your own blocks in Design CAD (B)', text: 'B (BLOCK), Create on the new Blocks panel, or Make block… on the right-click menu of drawn objects: name the block, pick its base point and its objects, and choose whether the objects stay, become one block (the default) or go. -BLOCK does the same on the command line. A block shows as the objects it was made of; it moves, copies, rotates and scales as one, explodes back into its objects, prints on the plan sheets and saves to DXF and DWG as a block with its inserts. Inserting a block again, with the Blocks palette, comes next.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.080', date: '2026-11-10',
    items: [
      { title: 'Points, Divide and Measure out in Design CAD', text: 'PO (POINT) draws a point at each click until Enter. DIV (DIVIDE) picks a line, polyline, arc, circle or ellipse and the number of parts: a point at each division. ME (MEASURE) picks an object and a length in metres: a point every length from the end nearer the click. Points snap with Node, move and copy like other drawn objects, print on the plan sheets and save to DXF and DWG as POINT entities. PTYPE opens the Point style dialog: twenty shapes (dot, plus, cross, tick, in a circle or square) and a size relative to the screen or in drawing units. All four are under Draw ▾.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.079', date: '2026-11-10',
    items: [
      { title: 'Draw order in Design CAD (DR)', text: 'DR (DRAWORDER), or Draw order under Modify ▾: pick the drawn objects, Enter, then Front, Back, Above or Under (Above and Under then ask for the reference object). The order is the paint order, so a solid hatch sent to the back no longer hides the symbols and texts over it, on the screen, on the plan sheets and in the DXF and DWG saved. TEXTTOFRONT brings the texts, dimensions or leaders over everything else. With drawn objects picked, the right-click menu has Draw order ▸.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.078', date: '2026-11-10',
    items: [
      { title: 'Notes in Design CAD: paragraphs in a box (MT)', text: 'MT (MTEXT), or Notes under the Text arrow: click two corners for the box, then type in it. Enter starts a new line and the lines wrap to the box\'s width. The small bar above the box has B and U for bold and underlined words, the height on paper, the justification (top left … bottom right) and OK; Ctrl/⌘+Enter or OK keeps the note, Esc leaves it as it was. Drag the grip at the box\'s right edge to change its width. A double-click on a note opens it again (ED works too); its right-click menu has Edit text, Width… and Justify. Notes move, copy, rotate, scale and mirror with the other drawn objects, show in the Properties palette (contents, height, width, rotation, justify), explode into one text per line, print on the plan sheets and save to DXF and DWG as a multiline text with its box.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.077', date: '2026-11-10',
    items: [
      { title: 'Double-click a text or dimension to edit it in place', text: 'In Design CAD, a double-click on a drawn text, a leader\'s text or a dimension opens a box over it, at its height and angle, with the text selected: type, then Enter keeps it (one undo step), Esc leaves it as it was, a click outside keeps it. ED (TEXTEDIT, DDEDIT) asks for the object instead, and stays for the next one; Edit text is on the right-click menu of a text or dimension. A dimension\'s typed text is its override: <> in it stands for the measured value ("<> mm" keeps measuring as the points move), and blank gives the measure back. A text on a locked layer is refused.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.076', date: '2026-11-10',
    items: [
      { title: 'Zoom Window, Previous and Scale in Design CAD', text: 'Z (ZOOM) asks Window, Previous, Scale or Extents. Z W: two corners (or drag a box) fill the view. Z P steps back through the last 20 views of the drawing, a wheel zoom or pan counting once it rests. Z S: a factor — 2 or 0.5 of the whole drawing, 2x of the view now. The zoom chip at the bottom right has a ▾ (or a right-click) with the same four, and a right-click on the drawing with nothing picked offers Zoom window, previous and extents.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Quick select and Select similar', text: 'QS (QSELECT, also under Modify ▾) opens a dialog: apply to the whole drawing or the selection, the kind of object, a property (layer, colour, linetype, lineweight, or the geometry and text of that kind), how its value compares (=, ≠, >, <, * wildcards, or all of the kind), include or exclude, and add to the current selection; it says how many it found before OK. SELECTSIMILAR (also on the right-click menu of a selection) picks every drawn object of the same kind and layer as those picked — a tray its width and service, a cable route its feeder; S adds colour or linetype to what must match.' },
      { title: 'Radius, diameter and angular dimensions', text: 'Annotate → Dimension ▾ gains Radius (DRA), Diameter (DDI) and Angular (DAN), in the current dimension style. DRA and DDI: click an arc or circle (drawn, or the architect\'s), then where the text goes: R1.25, Ø2.50 along the radius, the line running out to the text when it lies outside. DAN: two lines (the angle at their crossing, towards the ends clicked), an arc, or Enter for a vertex and two points, then where the arc goes — the side you click sets which angle, 90° or 270°, with the style\'s decimals. They move, turn, mirror and grip like other dimensions, show their measure in Properties, print on the sheets and save to DXF / DWG.' }
    ]
  },
  {
    version: '2.075', date: '2026-11-10',
    items: [
      { title: 'Output tab works in model space', text: 'Design CAD → Output no longer waits for a layout or sheet. With a drawing open in model space, Plot and PDF save the drawing\'s view as a black-and-white PDF, DXF and DWG open Save As, and Publish publishes the drawing\'s layouts. Pen tables opens from anywhere. On a layout tab, Plot opens the Plot dialog with its page setup. Preview still needs a layout or sheet.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.074', date: '2026-11-10',
    items: [
      { title: 'Drafting ribbon: every tool named, more tools on it', text: 'Design CAD → Drafting now uses the whole row: the small tools show their names, and tools you could only type before have buttons: Polygon, Extend, Chamfer, Break, Join, Keynote, Text style and Dim style. Text ▾ has numbered text and the text tools (justify, height, align, case, frame, mask, copy words). Measure and view has Distance, Area, Room area, Inspect, Zoom extents and Drafting settings.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.073', date: '2026-11-10',
    items: [
      { title: 'Luminaires by type in the BOQ', text: 'Lights placed with Light room (LUX) now keep their luminaire. The BOQ lists them in section J by type (L1, L2…), with emergency lights and exit / direction signs as EM1, EX1 and DS1, counted on the plans. The lighting point itself stays a load schedule point.' },
      { title: 'Luminaire schedule in the BOQ workbook', text: 'The BOQ Excel export adds a Luminaire schedule sheet when the plans have typed lights: type, description, manufacturer, watts, lumens, quantity, boards and levels, with total watts.' }
    ]
  },
  {
    version: '2.072', date: '2026-11-10',
    items: [
      { title: 'Solar PV in the BOQ', text: 'Your Solar PV sizing now reaches the BOQ under Power equipment: modules, mounting, string inverters, DC solar cable per string, connectors, DC switch-disconnectors and DC surge protection. An AC isolator is added only when no PV way is drawn on the SLD.' },
      { title: 'EV chargers in the BOQ', text: 'Each new EV charging circuit adds the charger itself (kW, single- or three-phase, Type 2, 6 mA DC fault detection) next to its breaker and cable.' }
    ]
  },
  {
    version: '2.071', date: '2026-11-10',
    items: [
      { title: 'Legend and notes tables placed on a layout', text: 'On a layout tab in Design CAD, LEGEND (LG) or Electrical → Legend places a legend table where you click: its rows are the symbols, trays, routes and references on the sheet, kept in step with the plan, at 2.5 mm in one or two columns, 92 mm wide unless you choose another width; pick its frame to move it or set its width, text height, columns, title, the rows hidden and rows of your own. NOTES places the sheet\'s notes the same way. A sheet with a legend table prints no legend in its column, one with a notes table no notes box; both go to PDF and DWG (lines and text on E-LEGEND / E-NOTES) at their place.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.070', date: '2026-11-10',
    items: [
      { title: 'A logo area in a drawn title block', text: 'A title block imported from CAD or drawn in Design CAD can hold the project\'s logo: tick Logo area in Project → Title block and set the area, or place the {Logo} field from the Properties palette in Design CAD (a dashed rectangle; stretch it to size, TBSAVE keeps it). The logo (Project → Drawing) prints inside it, centred and in proportion; a rectangle on a layer named LOGO in an imported block becomes the area. DWG / DXF carry no image, so the block\'s LOGO attribute shows the company name there for the CAD team to put their logo over.' }
    ]
  },
  {
    version: '2.069', date: '2026-11-10',
    items: [
      { title: 'Your company\'s whole sheet border', text: 'A title block imported from a DWG / DXF (or drawn in Design CAD) that is the size of a paper, A3 to A1, can be that paper\'s whole border: Project → Title block → Whole border, then Use on A3 sheets. Its sheets then print your frame, zone references and title strip in place of the app\'s, with the fields filled as before, and the drawing, legend column and notes inside the border\'s drawing area (found from its lines, shown dashed, movable in the designer or in Design CAD on TB-REF). Revision rows of its own fill from the issues through {Rev1} {RevDate1} {RevText1} {RevBy1} …, newest first; a border without them keeps the app\'s revision table in the column. Papers without a border keep the app\'s frame. DWG / DXF: one block with attributes at the paper\'s origin.' },
      { title: 'Design CAD: the title block drawing\'s tab', text: 'A title block open in Design CAD now says "Title block" in its tab, not "Level?".', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.068', date: '2026-11-10',
    items: [
      { title: 'Copy and paste drawn objects between drawings', text: 'Design CAD: pick drawn objects and press Ctrl+C (COPYCLIP), or Ctrl+Shift+C (COPYBASE) to click a base point first. Ctrl+V (PASTECLIP) brings them in another drawing tab or level, following the cursor to the point you click; PASTEORIG puts them at the same coordinates in another drawing, for a typical floor on the next level. Lengths are converted between mm and m drawings, a layer the drawing lacks is added with its colour, linetype and lineweight, and each paste is one undo step. Right-click → Clipboard ▸ has the same four. Trays and cable routes keep their data only in their own drawing; elsewhere they paste as polylines. Devices are not copied.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.067', date: '2026-11-10',
    items: [
      { title: 'Draw your title block in Design CAD', text: 'Project → Title block → Edit in CAD opens the block as a drawing of its own at 1 : 1 mm, inside an A3 frame for reference: its lines on TB-FRAME and TB-GRID, its texts on TB-TEXT and its fields on TB-FIELD, all the app\'s own objects, so Line, Rectangle, Circle, Text, Move, Trim, Offset and the other tools work on them. The standard block or a grid block opens as a drawn copy. With nothing picked, the Properties palette lists the fields: click one ({SheetNo}, {Rev}, {Project} …), then where it goes. TBSAVE, or Save as template on the palette, turns the drawing back into the template, which then prints on the sheets that use it and goes to DWG as a block with attributes.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.066', date: '2026-11-10',
    items: [
      { title: 'Your company\'s title block from a DWG or DXF', text: 'Project → Title block → Import DWG / DXF… reads a company title block drawn in CAD: the whole drawing, or one of its inserted blocks. Its lines and texts become a template; its attributes and placeholders (DWG_NO, TITLE, REV, DATE, DRN, CHK, APP, SCALE, SHEET …) become fields filled from the project and the sheet, and any text can be mapped to a field in the Texts and fields list. The block prints on every sheet in the PDF as drawn, and goes to DXF and DWG as a block with attributes, so a CAD program keeps its values editable. Grid templates and the standard block are unchanged.' }
    ]
  },
  {
    version: '2.065', date: '2026-11-10',
    items: [
      { title: 'Legend sheet', text: 'Design CAD → Sheets → + New sheet → Legend, abbreviations and notes adds one sheet, numbered before the SLDs (E-SLD-000), with every symbol of the project\'s SLD across the sheet, the abbreviations of the whole SLD and the general notes. The SLD and board sheets then carry no legend or abbreviations of their own: their notes say "LEGEND AND ABBREVIATIONS: SEE E-SLD-000" and the drawing takes the whole width. Riser and earthing sheets keep their own legends.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Board sheet with schedule', text: '+ New sheet → Board sheet with schedule adds, for the picked DB or every DB with circuits, a sheet with the DB\'s circuit diagram and its load distribution schedule under it: Sl., circuit, ELCB group, MCB, wire and ECC sizes, room, points, R / Y / B watts and remarks, with the totals and maximum demand, the incomer, location and watt per unit above. A board sheet\'s settings have a Load schedule under the diagram switch. The schedule prints in the PDF and the DXF / DWG and counts in the sheet\'s fingerprint.' }
    ]
  },
  {
    version: '2.064', date: '2026-11-09',
    items: [
      { title: 'Numbered texts and keynotes in Design CAD', text: 'TCOUNT (TNUM): type a prefix, the start number (01 keeps two digits), the step and a suffix, then click where each numbered text goes (L01, L02 …, centred on the click); U takes the last one back, S renumbers the texts picked in the order picked. KN (KEYNOTE): the number, where it goes and its note; it draws a numbered hexagon and a line in a KEYNOTES legend (the first time it asks where the legend starts; the next lines follow under it).', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Frames and masks round texts', text: 'TFRAME puts a circle, box or hexagon round the texts picked, sized from their height, moving and scaling with them (None takes it off). TMASK fills the box under a text in the paper colour so it reads over hatches, trays and underlays. Both are in the Properties palette too, and save to DXF and DWG (the mask as a solid hatch on LV-MASK).' }
    ]
  },
  {
    version: '2.063', date: '2026-11-09',
    items: [
      { title: 'Sheet furniture: revision rows, legend strip, a block per sheet kind', text: 'Sheet furniture (Design CAD → Sheets → Title block & numbering, and each sheet\'s settings) has more choices: a revision table of 6 or 8 lines, blank ones ruled, beside the title block; the legend in a strip along the foot of the drawing area, or in two columns of the right column (on A2 and A1 when it is long, or always); and, for riser and earthing sheets, the legend and notes in the sheet\'s column instead of inside the drawing, their schedules staying where they are. Title block & numbering can also give the riser and earthing sheets, the plan sheets or the report pages a title block of their own. As before, nothing changes until a value is chosen, and PDF and DXF / DWG agree.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.062', date: '2026-11-09',
    items: [
      { title: 'Sheet furniture', text: 'Design CAD → Sheets → Title block & numbering has a Sheet furniture section for what prints around the drawing on every sheet: zone references in the margin (off, on A2 and A1, or on every paper), centring marks, the legend column\'s text height (2.5 or 3.5 mm), the notes above the title block or in the legend column and the width of the notes box, and the smallest height the drawing\'s text may print at before a sheet counts as crowded (1.8 mm as before, 2.5 or 3.5). Each open sheet has the same choices in its settings, blank meaning as the set. Left alone, the sheets print as before. The PDF and the DXF / DWG files follow the same choices.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.061', date: '2026-11-09',
    items: [
      { title: 'Text tools in Design CAD', text: 'Pick texts, type the command, Enter, then the value. TA (TALIGN) lines them up Left, Right, Centre, Top or Bottom on a text or point you click, or Spacing sets them evenly down the page a gap apart on paper. TC (TCASE): Upper, Lower, Title or Sentence. TPREFIX and TSUFFIX add words before or after each. TOR (TORIENT) turns each about its centre to read from the bottom or the right. TCEN centres one text between two points. TCOPY gives the texts picked the words of another text you click. Each is one undo step.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Tag all rooms', text: 'RTALL (ROOMTAGALL) places a room tag (name and area) in every room of the level that has none yet; A tags them all again.' }
    ]
  },
  {
    version: '2.060', date: '2026-11-09',
    items: [
      { title: 'Justify text and set its height in Design CAD', text: 'Pick texts and type TJ (TJUST): Left, Centre, Right or TL … BR moves each text\'s anchor on its box without moving the text on the plan, and the Properties palette has a Justify row. TH (TXTHEIGHT) sets the height on paper (mm) of the texts and dimensions picked, keeping their anchor, with the ISO series 1.8 · 2.5 · 3.5 · 5 · 7 · 10 offered; with nothing picked it sets the height for new text. Justified texts save with their alignment in DXF and DWG, and texts read from a drawing with another alignment now sit where that drawing put them.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.059', date: '2026-11-09',
    items: [
      { title: 'Legends print at 2.5 mm', text: 'The legend on every drawing sheet (SLD, risers, DB riser) is drawn for its column, so its labels print at 2.5 mm, the ISO minimum, whatever the labels say: a long label takes two lines instead of making the whole legend smaller. The cable schedule, abbreviations, notes, board summary and the revision table print at 2.5 mm too (they were about 2 mm), on the PDF and in the DXF and DWG files. A sheet whose legend column is now too full for its paper says so in Publish; choose a larger paper for it.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.058', date: '2026-11-09',
    items: [
      { title: 'Output tab in Design CAD', text: 'Design CAD has a new Output sub-tab with everything that gets a drawing onto paper or out of the app: Plot, Preview, Page setups, Pen tables and Printers; Publish and Batch plot; and PDF, DXF, DWG and Register. Plot, Publish and export are no longer on Electrical, ELV & sheets.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Plot to a printer', text: 'Output → Plot sends the open layout or sheet to PDF or to a printer installed on this computer, with copies, a named page setup or its own paper, scale and pens. Tick Keep to save the settings as the sheet\'s page setup. Output → Printers chooses where plots go. Printing stays black-and-white.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Named page setups', text: 'Output → Page setups keeps page setups by name (for example "A1 1:100 PDF"): paper, scale for plans, pen table, lineweights, plot stamp and printer. Apply to… gives one to many sheets at once, and editing it later changes every sheet that uses it.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Batch plot', text: 'Output → Batch plot plots many layouts and sheets in one run, in the order you set, each with its own page setup for that run, to one PDF, a PDF each or a printer. Save the list with the project and run it again later.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Register to Excel', text: 'Output → Register saves the sheet register as an Excel workbook.' }
    ]
  },
  {
    version: '2.057', date: '2026-11-08',
    items: [
      { title: 'Properties on the left in Design CAD', text: 'Design CAD shows the Properties palette where the Panels list was (Panels stays on SLD, the load schedule and the other pages), and the column on the right is gone, so the drawing is wider. Pick anything and the palette shows it: a line\'s layer, colour and geometry, a device\'s circuit, room and position, a tray\'s width and route, or the architect\'s object with its layer and size. With nothing picked: the defaults for new objects and the drawing. The tool you are using, the plans and the layers follow below. Drag its edge to widen it, ⇄ docks it on the right, « or Ctrl/Cmd+1 folds it to a strip.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'LVCAD', text: 'Design CAD\'s first sub-tab is now called LVCAD (it was Drafting).' }
    ]
  },
  {
    version: '2.056', date: '2026-11-08',
    items: [
      { title: 'Design CAD File menu', text: 'File has Open, Close, Save, Save As, Export and Publish. Open lists a drawing file, the drawing open last and the plan of each level; Close closes this drawing, all, or all but this one. Save writes again to the copy you saved last (keeping the one before as .bak); the first time it is Save As, where you name the copy, choose DWG or DXF and its version (back to 2000, or DXF R12), and what goes in. The architect\'s drawing is never changed. A drawing changed since it was saved shows ● on its tab, and Close asks first.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Export and Publish from Design CAD', text: 'File → Export: a PDF of the view (black on white) or of the layout, an image, the objects picked as a DXF of their own (WBLOCK), and the device list and cable route lengths of the plan as Excel. File → Publish opens Publish with this drawing\'s layouts ticked.' },
      { title: 'Drafting settings', text: 'Type DS, click ⚙ on the status bar, or right-click a status-bar toggle: snap and grid spacing, polar tracking (F10) and its angles, object snap tracking (F11), the snap modes (now with Nearest and Perpendicular), dynamic input, selection window and grips, crosshair, aperture and marker sizes, lineweights (LWT), and the drawing\'s level and units (moved here from File).' }
    ]
  },
  {
    version: '2.055', date: '2026-11-08',
    items: [
      { title: 'More ways to draw', text: 'Draw has Ellipse (EL): its centre, the end of one axis, then the other axis, or A for the two ends of an axis. Polygon (POL) is under Rectangle\'s arrow: type the number of sides, then the centre and the radius (I: corners on it, C: sides touching it). Circle\'s arrow draws one by its diameter, two points or three points (or type 2P, 3P, or D after the centre); Arc\'s draws one by its start, centre and end.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Revision clouds', text: 'Annotate → Revision cloud (REVCLOUD): two corners round the change, or P and its points. The arcs are 15 mm long on paper at the annotation scale, or type a length first. Clouds and ellipses are saved as such in DXF and DWG, print on the plan sheets, and can be moved, copied, rotated, mirrored and scaled; drag a cloud\'s corner to reshape it.' }
    ]
  },
  {
    version: '2.054', date: '2026-11-08',
    items: [
      { title: 'Design CAD: the Drafting tab', text: 'Design CAD opens on Drafting: Draw, Modify, Annotate, Layers, Properties and Measure in one tab, laid out as drafting programs usually are. The main tools carry their name under the icon; the others are small icons with their name, typed command and what they do on hover. Electrical, ELV & sheets has the rooms, trays and cable routes, devices, wiring, references, the sheet set and layouts, and on the sheets pages every sheet tool. Show labels names every tool; the tools then take four sub-tabs.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Layers from the ribbon', text: 'The current layer is on the ribbon, with a list of the drawn layers to make another current. Pick objects, then Layer off, Freeze, Lock, Unlock or Make current act on their layers (LAYOFF, LAYFRZ, LAYLCK, LAYULK, LAYMCUR); All on and Thaw all act on every layer (LAYON, LAYTHW).' },
      { title: 'Colour, linetype and lineweight of new objects', text: 'The three lists beside Match properties change the drawn objects picked or, with nothing picked, the lines, polylines, rectangles, circles and arcs you draw next. The properties palette shows and sets the same while nothing is picked. The ↘ beside Properties shows the palette.' },
      { title: 'Fit on the status bar, and narrow windows', text: 'Fit is on the status bar under the drawing, beside SNAP, OSNAP, ORTHO, GRID and DYN. When the window is too narrow, the right-most panels fold to one tool each, named for the panel; New layout, viewport Scale and Copy to level work from a folded panel too.' }
    ]
  },
  {
    version: '2.053', date: '2026-11-08',
    items: [
      { title: 'Design CAD: tools grouped by use', text: 'Design CAD\'s sub-tabs follow what you are doing: Draw (the tools that create geometry), Modify (the tools that change it), Annotate, Insert, Layers, View, Page setup, Tools, and Electrical & ELV for rooms, trays, cable routes, devices and wiring. Plan and Sheets are gone: their tools are on these sub-tabs, and the sheet set opens from Page setup → Sheet set. File, left of the sub-tabs, opens, saves and closes drawings and sets the level and units. Design CAD opens on the sub-tab you used last.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Icons only, the name on hover', text: 'Each Design CAD tool shows its icon only, so every tool fits. Rest the cursor on one for its name, typed command and what it does, or tick Show labels (also in Preferences → App) to see the names. Tools that worked only as typed commands are now buttons too: Extend, Chamfer, Text style, Dimension style, Attach and Clip a reference, New layer, Isolate and Unisolate, the properties palette, the command history, and the snap and grid toggles.' }
    ]
  },
  {
    version: '2.052', date: '2026-11-08',
    items: [
      { title: 'Design CAD: layer palette', text: 'The layer manager is now a palette docked beside the drawing (LM or LAYER; LA still shows the Layers list). Each layer has On, Freeze, Lock, Print, colour, linetype and lineweight, with New, Delete and rename (double-click or F2). Double-click the first column, or type CLAYER and a name, to make a layer current; LAYISO keeps only the layers of what you pick and LAYUNISO brings the others back; layer states save and restore a set. A layer of the architect\'s plan turned off now stays off when the drawing opens again; the drawing file is not changed.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: properties palette', text: 'Pick objects and their properties show in a palette beside the drawing (Ctrl+1 or ⌘1 shows or hides it): layer, colour, linetype and lineweight, then the shape: start and end, length and angle, centre and radius, vertices, text, height and rotation, and a dimension\'s text override. With several objects picked it shows the values they share and lets you narrow them to one kind; a value typed changes them all in one undo step.' },
      { title: 'Index colours', text: 'Layers and objects take index colours 1–255 as well as the named colours: pick one from the grid, or type 8 or "colour 8". A true colour can be typed as #rrggbb or r,g,b. Colours show on screen only; sheets still print black and white.' },
      { title: 'Command line', text: 'Up and Down bring back the commands typed before; F2 shows a taller history and F1 the list of commands. Enter, or a tap of Space, ends a step, and with no tool running repeats the last command (holding Space to pan does not). Right-click the drawing for Enter and the options of the step, or, with no tool, Repeat and the recent commands.' },
      { title: 'Lengths and angles at the cursor', text: 'While Line, Polyline, Move, Copy, a tray or cable route and the other point tools run, boxes beside the cursor take the length and angle of the next point: type a number, Tab to the next box, Enter to place the point. ↓ in a box lists the options of the step. F12 turns the boxes off and on.' },
      { title: 'Edit dialogs, text and dimension styles', text: 'Offset, Fillet, Chamfer, Scale, Mirror and Array have a small settings dialog: its values apply as you type, and Esc or Cancel takes back only what you changed in it. Text style (ST) keeps named styles with their height on paper. Dimension style (D) sets the arrows, sizes, unit and decimals of new dimensions, whose text is measured from their lines, so it stays right after you edit or scale them. With the Standard style unchanged, dimensions draw as before.' },
      { title: 'Permanent ids for boards and circuits', text: 'Each board and circuit now keeps a permanent id, so links to it survive a rename or a copy, and renaming a panel keeps its floor plan links (its place and its cable routes). Project files are saved as version 2: an older version of the app opens them read-only.' },
      { title: 'Design data for AI and add-ins', text: 'An AI assistant connected to the app (MCP) or a script can export the electrical design as one JSON file in a published format: boards, circuits with breaker, cable, length and load, ELV devices, and the results of a calculation made then (voltage drop, fault levels, Zs, pass or fail). Each change, proposal and export made this way is recorded with the name of the AI client.' }
    ]
  },
  {
    version: '2.051', date: '2026-11-07',
    items: [
      { title: 'Web version: no false "New version"', text: 'Right after an update, the browser version could show "New version 2.043 — reload" while it was already running the newest version: it took the older copy kept for offline use for a newer one. It now offers Reload only for a later version, and the button goes away once the page is current.' }
    ]
  },
  {
    version: '2.050', date: '2026-11-07',
    items: [
      { title: 'Design CAD: model and layouts', text: 'As in industry CAD, you draw once in Model and each sheet is a layout. Tabs under the drawing: Model, one tab per layout of the level (its sheet number), and + for a new one; right-click a layout for Rename, Copy, Move, Page setup and Delete. A layout is the sheet\'s paper with its title block and viewports onto the model: MV adds a viewport, VPSCALE and VPLOCK set its scale and lock, and a double-click inside works in the model through it (MS; PS or a double-click outside goes back). Your plan sheets are layouts already, nothing to convert.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Viewports print as placed', text: 'Each viewport can show another plan type (a power key plan on a lighting sheet), freeze layers for itself only (Layer manager → This viewport) and hide references; its frame does not print unless you tick Frame prints. Notes, callouts, clouds, lines and boxes go on the paper from the command line (T, LE, CLOUD, L, REC) with the Sheets markup tools. Sheets stay black and white.' }
    ]
  },
  {
    version: '2.049', date: '2026-11-07',
    items: [
      { title: 'Bind keeps texts and hatches', text: 'Save DXF / DWG with Bind now copies a reference\'s texts and hatches into the saved copy too, not only its lines: grid labels, column marks and filled walls, on NAME$0$LAYER layers. Pattern hatches keep their pattern, scaled and turned with the reference. With a clip, a text is kept when it starts inside, a hatch when it is all inside.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.048', date: '2026-11-07',
    items: [
      { title: 'Plan sheets read their references', text: 'In the desktop app, a plan sheet now reads the references (Xref) it prints from where they were found on this computer, so you no longer need to open the plan in Design CAD first. A reference that cannot be read is still named in the sheet\'s notes as not printed.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.047', date: '2026-11-07',
    items: [
      { title: 'Design CAD: references (Xref)', text: 'Show another drawing under a level\'s plan without copying it in: the structure, other services or a site plan. File → References (XR) attaches one (XA) at the same origin or a picked point, with its scale worked out from the units, a rotation and a fade. The manager shows each one as Loaded, Changed — reload, Unloaded or Not found, with Reload, Unload, Detach, Repath, Clip and Bind. References found inside the architect\'s DWG are listed so a missing one can be found. You can snap to a reference but not edit it, and the file is never changed.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'References on the plan sheets', text: 'A reference prints grey with the new References pen (Plot → Pens); structure drawings print by default, other services do not. Each reference and each of its layers (NAME|LAYER) has its own Print tick. Bind saves a copy of the plan with the references\' lines on NAME$0$LAYER layers.' },
      { title: 'Design CAD finds the references inside a plan', text: 'When you open an architect\'s DWG or DXF that names other drawings (external references), the desktop app now looks for each one: at the path saved in the drawing, from the plan\'s folder, beside the plan, and in a folder next to it named like the saved one (for example Xref). Those found are shown under the plan where the drawing places them, and ⌘Z undoes it. Those not found are named in the command line; References → Repath… finds them. One you detach is not looked for again on this computer.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.046', date: '2026-11-07',
    items: [
      { title: 'SLD: earth pits clear of the incomer', text: 'A main board with no outgoing panels (as in a new project) draws its LV earth pits, test link, notes and MET in their own band left of the incoming line. They no longer run into the incomer breaker, its label or the board\'s voltage and loading figures.' }
    ]
  },
  {
    version: '2.045', date: '2026-11-07',
    items: [
      { title: 'Plan sheets print what you draw', text: 'Lines, arcs, circles, hatches, text, dimensions, leaders and room tags drawn in Design CAD now print on the level\'s plan sheets, black and white, with their linetypes and lineweights. Hatches print with the new Hatch pen (Solid in light grey); lines without a lineweight use the new "Your drawn lines" pen (Plot → Pens).', action: 'sheets', actionLabel: 'Open Sheets' },
      { title: 'Choose what prints', text: 'Layer manager has a Print column: untick it to keep a layer on screen but off the sheets. Page setup has "Print drawn work" per sheet, and warns when the sheet\'s scale is not the scale the text was drawn for.' }
    ]
  },
  {
    version: '2.044', date: '2026-11-07',
    items: [
      { title: 'Design CAD: the Draw ribbon fits the screen', text: 'The Draw sub-tab is laid out in the panels CAD users know: File, Draw, Modify, Annotation, Layers and Properties. Modify is a 3 × 4 grid of small buttons: Move Rotate Trim Erase / Copy Mirror Fillet Explode / Stretch Scale Array Offset. Extend is under Trim\'s arrow, Chamfer under Fillet\'s, and Break and Join under Modify ▾. On a narrow window the File panel (then Layers) folds into one button instead of the ribbon scrolling sideways.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.043', date: '2026-11-07',
    items: [
      { title: 'Design CAD: Hatch', text: 'Draw → Hatch (H): choose Solid, ANSI31, ANSI37, Net or Dots with its spacing (paper mm) and angle, then click inside a closed drawn object or a room. Use it for plant rooms, riser shafts and no-go zones.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: leader, room tag, north arrow and text height', text: 'Annotate has Leader (LE: an arrowed line and its text), Room tag (RT: the room\'s name and area) and North arrow. Text height is set in paper mm at the plan scale (2.5 mm at 1:100), for Text, Dimension and these tools.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.042', date: '2026-11-07',
    items: [
      { title: 'Design CAD: layer manager', text: 'View → Layer manager (LM) lists the layers drawn in the app, each with on, lock, colour, linetype and lineweight, and the architect\'s layers with on and a colour of their own on screen. Objects on a locked layer can be seen and snapped to, but not picked or edited.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: object properties and Match properties', text: 'Pick drawn objects to set their layer, colour, linetype (dashed, hidden, center, dot…) and lineweight in the side panel; blank is ByLayer. Match properties (MP) copies them from one object to others; trays and cable routes keep their own layers.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.041', date: '2026-11-07',
    items: [
      { title: 'Sheets: page setup and pen tables', text: 'Design CAD → Sheets → Plot has Page setup and Pens. Page setup sets each sheet\'s paper, scale (plan sheets), pen table, lineweights and an optional plot stamp, or saves them as the set\'s default. A pen table gives each kind of line its width and black or grey ink: frame, title block, architect\'s plan, devices, trays, cable routes, SLD lines and busbars. The default prints exactly as before.', action: 'sheets', actionLabel: 'Open Sheets' },
      { title: 'Import a CTB plot style table', text: 'Pens → Import CTB… reads a .ctb from your CAD program\'s plot styles folder. Each kind of line takes the width and screening of the colour its DXF layer uses: frame, title and cables 7, devices and trays 3, busbars 1, the architect\'s plan 8.', action: 'sheets', actionLabel: 'Open Sheets' },
      { title: 'Publish chosen sheets', text: 'Publish now prints this sheet, the ones you tick (shown by kind), or all of them. The output is one PDF, one PDF per sheet, or DXF or DWG per sheet, each with its own page setup.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.040', date: '2026-11-06',
    items: [
      { title: 'Design CAD: Trim, Extend, Offset, Fillet', text: 'Draw → Edit has Trim (TRIM) and Extend (EX). Click the part to cut away or the end to lengthen: it stops at the nearest line, drawn or the architect\'s, and the architect\'s drawing is never changed. Offset (O) copies a line, tray or circle at a distance. A tray stays a tray of the same width and route. Fillet (F) and Chamfer (CHA) join two lines at their corner; two trays meet in a bend.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: Break, Join, Explode, Mirror, Scale, Stretch, Array', text: 'Break (BR) splits a line or takes a part out. Join (J) makes lines that meet end to end one polyline. Explode (X) splits a polyline into lines. Mirror (MI), Scale (SC) and Stretch (S) are in Modify; Stretch makes a tray run longer while its far end stays. Array (AR) copies in rows and columns or round a centre.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: grips and a toolbar for drawn objects', text: 'Click a drawn line, tray or route: square grips show at its ends and middles. Drag one to change it. A toolbar beside it has the edits that suit it, and right-click gives the same as a menu. A window or Shift-click picks several drawn objects and devices together.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.039', date: '2026-11-06',
    items: [
      { title: 'Design CAD: edit several devices at once', text: 'Click a device, Shift-click to add or remove one, or drag a window round devices (Plan → Edit devices → Select). Left to right picks what is inside; right to left also picks what it crosses. A toolbar opens beside them with what suits them: Align row or column, Space equally, Replace, Circuit, Match, Move, Copy and Delete. The circuit list shows each circuit\'s points after the change and warns above the Rules limit. Right-click a device for the same as a menu.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Design CAD: Array on line and Match', text: 'Array on line (ARL) places devices evenly along a line you click, by number or spacing, half a spacing from each end or on the ends. Match (MA) gives each device you click the circuit of the first one, and its type if ticked.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.038', date: '2026-11-03',
    items: [
      { title: 'Busbar rating on board sheets', text: 'A board\'s busbar now reads like "200 A, 3φ 4W, 50 Hz CU BUSBAR". Enter the busbar Icw (kA for 1 s, from the panel builder) in the board\'s properties and it is printed too, with "Isc ≤ Icw" beside the fault level and a BUSBAR Icw line in the panel summary. When the Icw is below the fault level at the board, it goes on the to-do list. Nothing is assumed when it is left blank.' },
      { title: 'Panel sections', text: 'In a board\'s properties, under On the SLD, tick Fire alarm interface, Control section, BMS section or Metering section. Each is drawn as a labelled strip at the end of the busbar on the board sheet (PDF and DXF) and listed in the panel summary.' },
      { title: 'Busway tap-off supply', text: 'A board on a busway riser now shows "FROM <riser> (TAP-OFF)" on its board sheet, with the riser\'s source board below it, instead of only the board above.' }
    ]
  },
  {
    version: '2.037', date: '2026-11-03',
    items: [
      { title: 'Design CAD: Emergency lighting', text: 'Plan → Devices → Emergency (EM), after BS 5266-1 and EN 1838. Draw each escape route from the far end to the exit (Enter to finish), click rooms for open-area lighting, and mark points of emphasis such as call points, extinguishers, exit doors and stairs. Fittings go at the ends, at each change of direction and at each point of emphasis, with the gaps split to the fitting\'s spacing. Exit and direction signs are added, and the panel warns when a sign is too far to be seen. Place puts the fittings and signs on an unswitched lighting circuit.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Emergency lights on the Lighting layout', text: 'Emergency lights, exit signs and direction signs have their own symbols (E, EX, DS) on the plan and on the Lighting layout sheet, each with its own line and count in the legend. On the load schedule they count as lighting points on their circuit.' }
    ]
  },
  {
    version: '2.036', date: '2026-11-03',
    items: [
      { title: 'Design CAD: Light room', text: 'Plan → Devices → Light room (LUX): point at a room to see its lights, worked out by the lumen method for the room\'s own outline (L-shaped and angled rooms too). Click to keep them. Then set the target lux, ceiling, luminaire, maintenance factor and circuit, and Place puts them on the circuit. Warnings show when the room is below target, the spacing is too wide for the luminaire, or the W/m² is over the room type\'s limit. This is the average lux only; use DIALux or Relux for uniformity.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Luminaires in the database', text: 'A new Luminaires sheet in the database (Luminaires.xlsx) lists the luminaires Light room offers: name, lumens, watts, the largest spacing-to-height ratio and the manufacturer. It starts with three typical LED fittings; replace them with your suppliers\' data, in Excel or on the Database page.' }
    ]
  },
  {
    version: '2.035', date: '2026-11-03',
    items: [
      { title: 'Edit circuit in tabs', text: 'Double-clicking a load schedule circuit opens its edit window in three tabs: Loads, Protection & wiring and General. It opens on the tab of the cell you double-clicked. A line at the top shows the circuit\'s load, MCB, wire size and PASS / FAIL, and updates as you type, before you save.' },
      { title: 'Calculated results while you edit', text: 'Protection & wiring now shows the design current, cable rating, Ib ≤ In ≤ Iz, voltage drop, earth-fault disconnection and the circuit\'s ELCB, for the circuit as it will be after Save.' },
      { title: 'Less typing on circuits', text: 'Only the point columns that fit the circuit are shown (lighting or power); More columns… shows the rest. A room name offers its usual points in one click (Bedroom, Kitchen, Bathroom…, or the same room on another DB). These are starting values, so check them. Same as… copies the points of another circuit on the DB. A circuit wired in Design CAD takes its length from the plan.' }
    ]
  },
  {
    version: '2.034', date: '2026-11-03',
    items: [
      { title: 'A test link for each earth pit', text: 'On the DEWA-style SLD, a main board\'s LV earth pits now each have their own conductor and test link (TL1, TL2 …), so one pit can be tested while the others keep the board earthed. The MET is a short vertical bar inside the panel under the name box, the conductors leave the panel evenly spaced along it, and the pits stand side by side outside the panel with the minimum spacing drawn between them. On screen and in PDF, DXF and DWG.' }
    ]
  },
  {
    version: '2.033', date: '2026-11-02',
    items: [
      { title: 'Earth pits no longer overlap the transformer', text: 'On the standard-style SLD, a main board with its own transformer drew the LV earth-pit detail across the transformer symbol: the pits sat on the body-earth boundary, the spacing arrow crossed the cable note, the electrode note ran through the voltage tag, and MET collided with the result rows. The supply head is now taller and the detail has its own band below the transformer, with the earth conductor dropping clear of every label. The DEWA style is unchanged. On screen and in PDF, DXF and DWG.' }
    ]
  },
  {
    version: '2.032', date: '2026-11-02',
    items: [
      { title: 'Two new colour themes', text: 'The app now has two palettes, each in dark and light: Graphite, neutral charcoal and warm drafting paper with the amber accent, and Blueprint, deep ink blue and blueprint paper with a blue accent. Graphite dark is the new default and replaces the navy look. Pick the palette and mode under Preferences → Appearance & saving. Drawings, PDF and DXF exports are unchanged: always black on white.' }
    ]
  },
  {
    version: '2.031', date: '2026-11-02',
    items: [
      { title: 'SLD labels stay inside their panel', text: 'On the SLD in the DEWA style, the breaker and cable text of a panel\'s last way ran across the dashed frame into the panel beside it. Each frame is now as wide as its labels, and the next panel moves along to keep a gap between them. On screen, on sheets, in PDF and in DWG. The standard style is unchanged.' },
      { title: 'A clearer DOL starter', text: 'The DOL and star-delta starter box is wider, so its letters no longer touch the box, and it now sits below the breaker, joined to the cable under it instead of across the breaker.' },
      { title: 'Title block lines that meet', text: 'On drawing sheets the revision table and the title block now share one band: each line of one runs on into the other, the legend column\'s edge comes down onto the band, and the bottom and right edges are one frame line instead of a thin line beside a thick one. The same in PDF, DXF and DWG.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.030', date: '2026-11-02',
    items: [
      { title: 'Quicker load schedule on large projects', text: 'Adding, deleting and typing in the load schedule are quicker on large projects: with 200 panels, a typed number or a new circuit shows in about a quarter of the time it took before. Small projects were already quick. Editing the schedule does not recalculate the SLD; the studies wait for Run (F5) unless Auto-run is on. Results do not change. One small difference: after you undo back to what was saved, the ● unsaved mark clears a moment later.' }
    ]
  },
  {
    version: '2.029', date: '2026-11-02',
    items: [
      { title: 'A message instead of a dead window', text: 'An error while drawing a screen used to blank the whole window, and nothing could be clicked. Now only that page shows a message with Try again, and the rest of the app keeps working, so you can go to another page and save.' },
      { title: 'Unsaved work kept when the whole app has to stop', text: 'If the whole app does have to stop, it first keeps your unsaved project as a recovery copy and tells you so. Press Reload, then Restore it in the bar at the top. What you drew in Design CAD is part of the project, so it is kept too; open the drawings again afterwards.' },
      { title: 'Desktop app: a window that stops or hangs', text: 'If the window itself stops or stops responding, the app now asks what to do, Reload or Keep waiting, instead of leaving it frozen. After a reload, any recovery copy is offered as usual.' },
      { title: 'An error log, on this computer only', text: 'Errors are now recorded so that a problem can be traced afterwards. When there are any, Help shows how many, with Copy error log to pass them on. Nothing is sent anywhere.' }
    ]
  },
  {
    version: '2.028', date: '2026-11-01',
    items: [
      { title: 'Web version: a new version no longer stops the app', text: 'If a new version went live while the web version was open, opening a page not yet loaded could blank the whole app, and nothing could be clicked. The open copy now keeps working until you press New version — reload. If a page cannot be loaded at all, that page says so with a Reload button, and the rest of the app keeps working. The desktop app was not affected.' }
    ]
  },
  {
    version: '2.027', date: '2026-11-01',
    items: [
      { title: 'A tidier ribbon', text: 'Project now comes first, then Load schedule, SLD and Design CAD, then one Stages tab, then Documents and BOM / Cost, with Standards at the far end. The row now fits a 1,280 px screen. Before, the last tabs went out of sight until you scrolled the row sideways.' },
      { title: 'The Stages tab', text: 'Concept, Schematic, Detailed design and Tender and IFC are now sub-tabs of Stages, the way Plan, Draw and Sheets are of Design CAD. Stages opens on the stage the project is at, marked Now, and a project still opens on its stage.' },
      { title: 'Detailed design shows its own tools', text: 'Detailed design now has Run, Selection, Voltage drop, Earthing, Protection and Issue detailed. The SLD tools it repeated are on the SLD tab, and so is More (Load flow, Quick calcs and the rest). No tool has been removed from the app.' }
    ]
  },
  {
    version: '2.026', date: '2026-11-01',
    items: [
      { title: 'Containment layout sheets', text: 'Design CAD → Sheets → + New sheet → Containment layouts: a sheet for every level with cable trays or cable routes drawn, numbered E-CNT-. Each tray is a single line labelled like "CT 300 POWER", each cable route is dashed and tagged with its cable and size, and the legend lists the tray lengths and fittings on the sheet.', action: 'sheets', actionLabel: 'Open Sheets' },
      { title: 'Plan sheets show when the design changes', text: 'A lighting, power, ELV or containment sheet issued from now on is flagged as changed when what it draws changes, such as a moved light or tray. Before, plan sheets were never flagged. Sheets already issued need one more issue.' },
      { title: 'North arrow back on plan sheet PDFs', text: 'On the PDF of a plan sheet the notes box covered the north arrow. The arrow now sits beside the scale bar, clear of the notes.' }
    ]
  },
  {
    version: '2.025', date: '2026-11-01',
    items: [
      { title: 'File tabs in Design CAD', text: 'Each drawing you open now has its own tab above the plan, with its level and file name. Click a tab to switch: the file is not read again, and the drawing keeps its zoom and layers. + opens another.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Close a drawing', text: 'Use × on the tab, Close in the File group, or the CLOSE and CLOSEALL commands. Right-click a tab for Close, Close others and Close all. Closing never asks to save: what you drew, rooms and devices stay in the project and come back when the file opens again.' },
      { title: 'Another project closes the last one\'s drawings', text: 'Opening another project now closes the drawings of the last one. Before, the old drawing stayed on screen in Design CAD, and rooms or devices added on it went into the new project.' }
    ]
  },
  {
    version: '2.024', date: '2026-11-01',
    items: [
      { title: 'Licence notices in the Mac app', text: "The Mac app now carries Electron's and Chromium's licence texts, as the Windows and Linux versions already do. The app grows by about 2 MB. Nothing else changes." }
    ]
  },
  {
    version: '2.023', date: '2026-11-01',
    items: [
      { title: 'Screens follow the same number formats', text: 'Pages now write values the way the reports do, so the page and the printout match: 20,558.80 kW, 13,073.2 A, 10.70 kA and 55.6 %. The cost table writes 12,345.00. Times use the 24-hour clock and dates read 1 Nov 2026 on every computer. Large headline figures stay whole so they fit, and the boxes you type in do not change. The calculated results are unchanged.' }
    ]
  },
  {
    version: '2.022', date: '2026-11-01',
    items: [
      { title: 'Drawings follow the same number formats', text: 'SLDs, board sheets and risers now write large values with a comma, such as TCL : 1,800.00 kW, 2,504 A and 2,064% loaded, and keep their short decimals so the labels still fit. A DEWA board label now reads TCL 1,518.80 · MDL 1,215.04 kW, to match the circuit labels. Title blocks write dates as 15 Oct 2026. DXF and DWG geometry does not move, and the calculated results are unchanged.' }
    ]
  },
  {
    version: '2.021', date: '2026-11-01',
    items: [
      { title: 'Schedules and forms follow the same number formats', text: 'Cable, equipment and tray schedules, DEWA load forms, DB load schedules, DM-D-013 and the building summary now write numbers the same way as the reports, such as 13,073.2 A and 16,447.04 kW. Registers and the BOQ write dates as 1 Nov 2026. In Excel, loads on the forms are now real numbers and register dates are real dates, so columns add up and sort. The calculated results are unchanged.' }
    ]
  },
  {
    version: '2.020', date: '2026-11-01',
    items: [
      { title: 'Reports write every number the same way', text: 'Calculation, study, voltage drop, power factor, UPS, solar and concept reports now use one format for each kind of value, such as 20,558.80 kW, 13,073.2 A and 15 Oct 2026, so the same load reads the same in every report. Ratings stay as 1600 A and 1000 kVA, Excel cells stay real numbers, and the calculated results are unchanged. A report changes only when you print or issue it again. Schedules, drawings and screens follow in later updates.' }
    ]
  },
  {
    version: '2.019', date: '2026-11-01',
    items: [
      { title: 'Large drawings open without freezing the app', text: 'Design CAD now reads DWG and DXF files in the background, so the app stays usable while a large drawing opens. When you open another drawing, the memory the last one used is given back at once, without restarting the app.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.018', date: '2026-11-01',
    items: [
      { title: 'Quicker edits with many revisions', text: 'On a large project with many issued revisions, each edit no longer re-reads every revision copy to check for unsaved changes. Nothing else changes.' }
    ]
  },
  {
    version: '2.017', date: '2026-11-01',
    items: [
      { title: 'Smoother zoom on large SLDs', text: 'On a large project, zooming and panning the SLD with much of the drawing in view no longer rebuilds the whole drawing at every step. Zooming in gains the most. The drawing itself has not changed.' }
    ]
  },
  {
    version: '2.016', date: '2026-11-01',
    items: [
      { title: 'SLD export holds the whole drawing', text: 'Export… on the SLD page could leave out boards and circuits if you were zoomed in, with no warning. The PDF, DXF, DWG and SVG now always hold the whole drawing. Please check any SLD you issued from this button since 3 October, and reissue it if parts are missing. Sheets from Design CAD → Sheets were not affected.' }
    ]
  },
  {
    version: '2.015', date: '2026-11-01',
    items: [
      { title: 'Much faster on large projects', text: 'The cable schedule and calculation report now take about a second or less, even on a 500-board tower, where they could take minutes. Typing stays quick as the project grows, and SLD sheets with cable reference labels draw faster. The calculated results are the same as before.' }
    ]
  },
  {
    version: '2.014', date: '2026-10-31',
    items: [
      { title: 'Standard paper for sheets', text: 'Auto paper now keeps every sheet on A3 landscape, or A3 portrait for a tall drawing, and goes to A2 or A1 only when A3 would be unreadable. A small drawing no longer drops to A4; you can still choose A4 on the sheet. A3 portrait is a new paper choice.', action: 'sheets', actionLabel: 'Open Sheets' },
      { title: 'DB riser for tall buildings', text: 'From G+2 up, a new Boards by level riser shows the DB references on each level, a tap-off box for each tap-off on a busbar riser, generator and transformer feeds with their changeover, and bus couplers. Identical floors share one row, and a board summary sits above the title block. On the SLD Riser tab, Add to sheet puts it in Design CAD → Sheets with its title block, drawing number and legend.', action: 'sheets', actionLabel: 'Open Sheets' },
      { title: 'Risers that continue over sheets', text: 'A tall riser continues on the next sheet at a match line, with lettered flags and the sheet numbers. Several busbar risers and cable outgoings keep their own columns on every sheet. You can choose where a new sheet starts in the sheet\'s Building section.' }
    ]
  },
  {
    version: '2.013', date: '2026-10-30',
    items: [
      { title: 'Reload for a new version (browser)', text: 'The browser version notices when a newer version is out, also in an installed app left open, and shows New version — reload in the top strip. The browser asks first if a project has unsaved changes.' }
    ]
  },
  {
    version: '2.012', date: '2026-10-30',
    items: [
      { title: 'Cloud the changes', text: 'An SLD sheet now remembers each panel and circuit when it is issued. Afterwards, Revision clouds → Cloud the changes lists what changed since that issue (for example "Cable (mm²) 35 → 50"); untick any you don\'t want, and each ticked panel or circuit gets a cloud with the next revision.', action: 'sheets', actionLabel: 'Open Sheets' },
      { title: 'Clouds round one circuit', text: 'A revision cloud can go round a single circuit\'s breaker and cable instead of the whole panel. It prints on the PDF and DXF like panel clouds.' },
      { title: 'Sheets issued before this version', text: 'Issue them once more: from then on their changes can be clouded.' }
    ]
  },
  {
    version: '2.011', date: '2026-10-30',
    items: [
      { title: 'Three-digit version numbers', text: 'The version now shows three digits after the dot: this is 2.011, then 2.012, 2.013 and on. Reports, issue stamps and backups show it the same way.' }
    ]
  },
  {
    version: '2.10', date: '2026-10-30',
    items: [
      { title: 'Plan sheets', text: 'Design CAD → Sheets → + New sheet: Lighting, Power or ELV layouts for all levels, at 1:100 on the smallest paper that holds the level. The architect\'s plan prints grey and the design black: devices, DBs, wiring, home runs and circuit tags, with a legend of the symbols used, scale bar and north arrow. Numbered E-LTG-, E-PWR- and E-ELV-, grouped under Plans.', action: 'sheets', actionLabel: 'Open Sheets' },
      { title: 'Large levels over several sheets', text: 'A level too big for A1 at 1:100 is split into parts, each sheet with a key plan of the level (its part shaded) and match lines naming the next sheet.' },
      { title: 'Plans in PDF, DXF and DWG', text: 'Plan sheets print and export with the rest of the set, at their scale. Set 1:50 or 1:200 in the sheet\'s scale to change it.' }
    ]
  },
  {
    version: '2.9', date: '2026-10-30',
    items: [
      { title: 'Title block at its standard size', text: 'Sheets keep the title block 180 mm wide with 2.5 mm text on A3, A2 and A1, instead of growing with the paper and the drawing (it reached almost half the width of an A1 sheet). A4 shrinks it only as far as it must. The revision table, notes and cable schedule follow, so more fits on each sheet.', action: 'sheets', actionLabel: 'Open Sheets' }
    ]
  },
  {
    version: '2.8', date: '2026-10-30',
    items: [
      { title: 'Cable trays as a single line', text: 'Design CAD → Plan: a cable tray run is now one line with its label in the line, like "CT 300 POWER" (and its route once assigned), the way design-stage layouts show it. DXF and DWG are written the same way.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'What a tray carries', text: 'Each tray run has Carries beside its width: Power, Lighting, ELV, Data or Fire alarm. New runs start as Power.' }
    ]
  },
  {
    version: '2.7', date: '2026-10-30',
    items: [
      { title: 'Circuit wiring on the plan', text: 'Design CAD → Plan → Wiring: Wire circuits joins every circuit\'s devices on the level with wiring arcs and a home run to its DB, tagged like "DB-GF1/L3 · 2C × 1.5 mm² · 23 m". Wire one does a single circuit (click it again to take it off), and Tags shows or hides the tags.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Wiring lengths in the cable schedule', text: 'Update schedules gives each wired circuit its length: along the arcs and home run, plus 1.5 m drop per device and 10 % allowance, rounded up. A cable route drawn for the circuit still comes first.' },
      { title: 'Wiring in DXF and DWG', text: 'Save DXF / Save DWG write the wiring on E-LV-WIRING and the tags on E-LV-TAGS.' }
    ]
  },
  {
    version: '2.6', date: '2026-10-29',
    items: [
      { title: 'The same view controls everywhere', text: 'The SLD, Design CAD and Sheets zoom, pan and fit the same way: the wheel or a pinch zooms at the cursor, two fingers on a trackpad pan, press the wheel (or hold Space) and drag to pan, double-click the wheel or press F to fit, + and − zoom, arrow keys pan.' },
      { title: 'Zoom in the corner', text: 'Every drawing shows its zoom in the bottom-right corner (100 % = all in view); click it to fit.' },
      { title: 'Grid dots in Design CAD', text: 'GRID (F7) steps lines → dots → off, as G does on the SLD.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.5', date: '2026-10-29',
    items: [
      { title: 'Sheet tools on the ribbon', text: 'With a sheet open in Design CAD → Sheets, the ribbon has its tools: Markup (Select, Cloud, Note, Callout, Arrow, Box, Line), On panels, Style (colour, text height, Delete), View (Fit, zoom, Legend, Side by side) and Issue and export. The sheet gets the whole page; the keys are the same.', action: 'sheets', actionLabel: 'Open Sheets' },
      { title: 'Black markups', text: 'New clouds, notes and callouts are black, like the printed sheets; red and blue are still in Style → Colour.' },
      { title: 'One sheet as DWG', text: 'Issue and export → DWG (or right-click a sheet) saves that sheet as a 2018-format DWG.' }
    ]
  },
  {
    version: '2.4', date: '2026-10-29',
    items: [
      { title: 'Sheets in Design CAD', text: 'Every submission sheet is in Design CAD → Sheets: SLDs, risers, the earthing schematic, earth riser and floor earthing, with the register (layout, title block and numbering, issues, export). The SLD and earthing screens keep the design; their Sheets button opens the sheet.', action: 'sheets', actionLabel: 'Open Sheets' },
      { title: 'Clouds and notes on earthing sheets', text: 'The earthing schematic, earth riser and floor earthing sheets get the Markup tools too: revision clouds, notes, callouts, arrows, boxes and lines, printed on the PDF and DXF.' },
      { title: 'New sheet from any panel', text: 'Panel and its branch asks which panel when none is picked; Side by side shows the design with each sheet\'s panels outlined, to move a panel to another sheet.' }
    ]
  },
  {
    version: '2.3', date: '2026-10-29',
    items: [
      { title: 'One drawing background', text: 'Design CAD now draws on the same background and grid as the SLD, riser, earthing and lux plans, in the dark and light themes. Switching theme redraws the CAD plan straight away.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'DWG colours you can read', text: 'Layer colours too faint on the background are shown lighter or darker with the same hue: yellow shows as gold on the light theme, blue lighter on the dark one. Saved DWG, DXF and PDF keep the original colours.' },
      { title: 'Black revision clouds on the PDF', text: 'Revision clouds and cable reference circles print black, like the rest of the drawing; riser busbar trunking prints black and shows in the busbar colour on screen.' },
      { title: 'SLD as DWG', text: 'Export SLD drawing → DWG saves the SLD sheets as a 2018-format DWG, with the same layers and title block as the DXF; continuation sheets come in a ZIP. Made by the Design CAD engine.' }
    ]
  },
  {
    version: '2.2', date: '2026-10-29',
    items: [
      { title: 'Design CAD: Save DWG', text: 'File → Save DWG (SAVEDWG) saves the plan as a DWG — in the version it came in, else the 2018 format — with what you drew, the trays and routes, and the devices placed, as a new file. The architect\'s drawing is not changed. Open it once in your CAD program to check before you send it.', action: 'cad', actionLabel: 'Open Design CAD' }
    ]
  },
  {
    version: '2.1', date: '2026-10-29',
    items: [
      { title: 'Design CAD: linetypes', text: 'Dashed, centre, hidden and other linetypes are drawn as in the drawing (with its LTSCALE and each object\'s scale); too fine to see at the zoom, they show continuous, as in CAD.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Hatches', text: 'Solid hatches and 2D solids are filled; pattern hatches (ANSI31, brick…) show their pattern lines inside the boundary, or a light fill when zoomed out.' },
      { title: 'Faster on big drawings', text: 'The drawing is kept in tiles and only what is on screen is drawn while you pan and zoom.' }
    ]
  },
  {
    version: '2.0', date: '2026-10-29',
    items: [
      { title: 'Loads from CAD reads Design CAD', text: 'Loads from CAD floor plan now counts the fixture blocks (with their CCT circuit) on the drawing open in Design CAD — no other CAD program needed.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'External CAD program link removed', text: 'Everything it did is built in: open, measure, rooms, devices, trays, routes and lengths in Design CAD. The SLD still exports as DXF for any CAD program.' }
    ]
  },
  {
    version: '1.99', date: '2026-10-29',
    items: [
      { title: 'One place for plans: Design CAD', text: 'Floor plan and CAD are now one page, Design CAD. Its ribbon has two sub-tabs over the same drawing: Plan (File, Rooms, Cables and boards, Devices, Measure) and Draw (Draw, Modify, Annotate). The Floor plan tab is gone; everything it did is in Design CAD.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Open with LV Design Studio', text: 'A DWG / DXF opened from Finder or Explorer now opens in Design CAD.' },
      { title: 'Turn cameras and speakers', text: 'Rotate (RO) on a camera or speaker: click where it faces, or type the angle; its coverage turns with it.' }
    ]
  },
  {
    version: '1.98', date: '2026-10-29',
    items: [
      { title: 'Design CAD: Fill room', text: 'Devices → Fill room (FILL): choose an ELV device (detector, speaker, data outlet…), point at a room to see them at their coverage spacing, click to place them all.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Coverage', text: 'Devices → Coverage (COV): what the chosen device\'s system covers, cut at each room, and the squares not covered; the panel says how many rooms are not fully covered.' },
      { title: 'Copy to level', text: 'Devices → Copy to level: this level\'s devices of that system to another level, at the same positions.' }
    ]
  },
  {
    version: '1.97', date: '2026-10-29',
    items: [
      { title: 'Design CAD: cable routes', text: 'Cables and boards → Cable route (CR): choose the cable, click its route. Or Link route (LR): click a line already on the drawing (a cable layer). Routes are dashed, with the cable\'s name along them.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Update schedules', text: 'One click (SCHED) takes every level\'s plan into the schedules: each tray route\'s length and fittings (bends, tees, reducers) for the tray schedule and BOQ, each cable\'s length (route + vertical + terminations + waste), and the tray routes it runs along. One undo step.' },
      { title: 'Place board', text: 'Place board is now in Cables and boards too: its room, level and position on the plan.' }
    ]
  },
  {
    version: '1.96', date: '2026-10-29',
    items: [
      { title: 'Design CAD: draw cable trays', text: 'Cables → Cable tray (CT): click the run\'s points, Enter to finish. It is drawn at its width (50–900 mm) with both edges and a "CT 300" label. The tray route is optional: leave it Not assigned and choose it later from the tray\'s panel.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Tray runs like any drawn object', text: 'Click a run to see its length; change its width or route; Move, Copy, Rotate and Erase it. Save DXF writes it on E-TRAY.' },
      { title: 'Tray fittings found as you draw', text: 'Bends where a run turns, a tee where a run ends on another tray (300 × 150 for a narrower branch), a cross where four meet, a reducer where widths change in line. Shown on the plan, counted in the tray panel, written into the DXF.' }
    ]
  },
  {
    version: '1.95', date: '2026-10-29',
    items: [
      { title: 'Design CAD: rooms', text: 'A new Rooms group. Add found (ROOMS) adds every room the plan outlines, named by the text inside, to Building information on the plan\'s level; adding again updates them. Click inside (RA) and Trace (TR) open the room form straight away, and the room keeps its outline.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Pick name', text: 'Pick name (PN): click the room name on the drawing. It names the room you just found, or renames the room the text is in.' },
      { title: 'Layer roles guess room outlines', text: 'Layers holding closed outlines or hatches with ROOM / AREA / SPACE in the name are now guessed as Room outline.' }
    ]
  },
  {
    version: '1.94', date: '2026-10-29',
    items: [
      { title: 'Design CAD', text: 'The CAD tab is now Design CAD, right after Project.', action: 'cad', actionLabel: 'Open Design CAD' },
      { title: 'Plans of each level', text: 'File → Plans: the drawing of each level of the project. Open one, open a drawing for a level without one, or replace a level\'s plan with the next revision — what you drew moves to it, devices stay.' },
      { title: 'Level, units and layer roles', text: 'File → Level says which level the drawing is (rooms and devices go to it); Units sets mm / m when the drawing does not say; Layer roles marks walls, room outlines and names, trays — Room area uses the walls.' }
    ]
  },
  {
    version: '1.93', date: '2026-10-28',
    items: [
      { title: 'CAD: draw', text: 'Line (L), Polyline (PL), Rectangle (REC), Circle (C), Arc (A) — with snaps, ORTHO, and typed input: a length, x,y, @dx,dy or @length<angle.', action: 'cad', actionLabel: 'Open CAD' },
      { title: 'CAD: modify', text: 'Move (M), Copy (CO), Rotate (RO) and Erase (E) for what you drew and the devices you placed; a copied light or socket counts on its circuit. The architect\'s drawing stays as received.' },
      { title: 'CAD: annotate', text: 'Text (T) and Dimension (DIM, in metres); all saved into the DXF on LV-SKETCH / LV-ANNO.' },
      { title: 'CAD: grid as lines', text: 'GRID (F7) now draws lines, with a stronger line every fifth.' }
    ]
  },
  {
    version: '1.92', date: '2026-10-28',
    items: [
      { title: 'CAD: add devices on the plan', text: 'Add device (DEV): lights, sockets, fans, A/C, water heaters on a circuit — counted on that circuit — a DB at its place, or ELV devices (detectors, cameras, data, speakers). Click a device to see it; Move (M) and Delete (E) as in CAD.', action: 'cad', actionLabel: 'Open CAD' },
      { title: 'CAD: save DXF with your devices', text: 'Save DXF writes the architect\'s drawing with the devices you placed on their own layers (E-LV-POINTS, E-ELV-DEVICES, E-BOARDS).' }
    ]
  },
  {
    version: '1.91', date: '2026-10-28',
    items: [
      { title: 'CAD: measure distances', text: 'Distance (DI): click two snapped points for the length, ΔX, ΔY and angle; ORTHO keeps it straight.', action: 'cad', actionLabel: 'Open CAD' },
      { title: 'CAD: areas and room areas', text: 'Area by corners or a closed object (AREA, O), or Room area: click inside a room, its outline comes from the walls. Add as room… puts it in Building information.', action: 'cad', actionLabel: 'Show me' },
      { title: 'CAD: click an object to see what it is', text: 'Its type, layer, handle, block name and attributes, length or area — shown in the Result panel and highlighted on the drawing.' }
    ]
  },
  {
    version: '1.90', date: '2026-10-28',
    items: [
      { title: 'CAD view: open drawings natively', text: 'A new CAD tab opens DWG / DXF the way a CAD program does: model space, crosshair, snaps (endpoint, midpoint, centre, intersection), layers on / off, blocks drawn as drawn, a command line and SNAP · OSNAP · ORTHO · GRID. Measuring and devices come next.', action: 'cad', actionLabel: 'Open CAD' }
    ]
  },
  {
    version: '1.89', date: '2026-10-28',
    items: [
      { title: 'Floor plan in the web version', text: 'The web version opens DWG / DXF plans too: the same reader runs in the browser, plans are chosen with the file picker and never leave your computer. The sample villa is there as well.', action: 'floor-plan', actionLabel: 'Open Floor plan' }
    ]
  },
  {
    version: '1.88', date: '2026-10-28',
    items: [
      { title: 'Sample G+1 villa plan for testing', text: 'The Floor plan page shows a sample villa (ground and first floor) while no plan is open: rooms with and without outlines, doors, boards, lights, cable routes and trays. Open plan replaces it with yours.', action: 'floor-plan', actionLabel: 'Open Floor plan' }
    ]
  },
  {
    version: '1.87', date: '2026-10-28',
    items: [
      { title: 'ELV schedules', text: 'The ELV page lists devices per room and floor, fire alarm loops and zones, switch ports, door controllers and PA zones, and an ELV BOQ. Type remarks on any row; export to Excel or a black-and-white PDF.' },
      { title: 'ELV plan sheets and DXF', text: 'One A3 sheet per level with all ELV systems in your title block; a typical level names its floors (L05–L09). DXF for CAD puts the devices on the architect plan in its own units.' },
      { title: 'ELV in the project BOQ, when you choose', text: 'Add to project BOQ… adds the ELV systems you tick to section P. Nothing is added by default, and the page tells you when the BOQ copy is out of date.' },
      { title: 'Choose the units of a floor plan', text: 'The Floor plan page shows the units the drawing is in and lets you change them; areas, positions and lengths follow. A drawing that does not say asks you first.', action: 'floor-plan', actionLabel: 'Open Floor plan' },
      { title: 'Opens faster', text: 'Pages and dialogs load when you first open them, and the app starts without loading spreadsheet code it does not need yet.' }
    ]
  },
  {
    version: '1.86', date: '2026-10-28',
    items: [
      { title: 'Design ELV on the floor plan', text: 'New ELV group on the Floor plan tab: pick fire alarm, CCTV, access control, data or PA, then place devices with a click or fill a room on a grid. Move, turn and delete them with Select.', action: 'floor-plan', actionLabel: 'Open Floor plan' },
      { title: 'Coverage, loops and quantities as you place', text: 'Detector, Wi-Fi and speaker coverage is checked over each room, with what is not covered shaded. The ELV tab shows devices per room, loops and zones, switch ports and PA amplifiers.', action: 'floor-plan', actionLabel: 'Show me' },
      { title: 'ELV fire alarm loops with 20 % spare', text: 'The ELV estimate now fills each loop to 80 % of 125 devices and checks its current in alarm, so some projects show more loops. Every limit is a project rule.' },
      { title: 'Rooms from the plan keep their shape', text: 'Rooms taken from a floor plan now remember their outline, ready for placing ELV devices on the plan.', action: 'floor-plan', actionLabel: 'Open Floor plan' },
      { title: 'Command line: ELV devices and schedules', text: 'elv-place-devices puts ELV devices on a level; elv-schedules gives the detection zones, loops with addresses, switch ports, door controllers and PA zones.' }
    ]
  },
  {
    version: '1.85', date: '2026-10-28',
    items: [
      { title: 'Floor plan is now a page beside the SLD', text: 'No pop-up window: the plan opens in the page canvas, and every tool is on the new Floor plan ribbon tab.', action: 'floor-plan', actionLabel: 'Open Floor plan' },
      { title: 'Picks go straight into the model', text: 'Click inside a room, trace it or pick its name, link a route or a tray run, place a board — each is added at once (⌘Z undoes it). The panel shows what is in the model.', action: 'floor-plan', actionLabel: 'Show me' },
      { title: 'The plan stays open', text: 'Move between pages and come back; next time the project offers to reopen the same plan.' }
    ]
  },
  {
    version: '1.84', date: '2026-10-28',
    items: [
      { title: 'Floor plan: open DWG / DXF in the app', text: 'No CAD program needed. Floor plan button on the Home and 1 Concept tabs; or in Finder right-click a drawing → Open with → LV Design Studio.', action: 'floor-plan', actionLabel: 'Open Floor plan' },
      { title: 'Rooms and areas from the plan', text: 'Found automatically, or click inside a room and click its name. They go to Building information, and the Load assessment follows.', action: 'floor-plan', actionLabel: 'Show me' },
      { title: 'Cable lengths from the plan', text: 'Routes on the cable route layers link themselves; choose a feeder and click its lines for the rest. Review and apply.', action: 'floor-plan-lengths', actionLabel: 'Show me' },
      { title: 'Tray routes and board locations', text: 'Name tray runs and place boards by clicking them on the plan; trays per feeder, tray lengths and board rooms are reviewed and applied.', action: 'floor-plan-trays', actionLabel: 'Show me' },
      { title: 'Command line: cad-plan and rooms-from-cad', text: 'Read a floor plan and take its rooms into a project without opening the app.' }
    ]
  }
];

/** "1.84" < "1.9"? Compared part by part as numbers. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The releases to show on this computer: those after the version last seen, up to the running one. When none was seen
 * yet, the running version's own items for an app used before (an update), and nothing for a new install. */
export function unseenReleases(lastSeen: string | undefined, current: string, usedBefore: boolean, releases: Release[] = RELEASES): Release[] {
  const upTo = releases.filter((r) => compareVersions(r.version, current) <= 0);
  if (!lastSeen) return usedBefore ? upTo.filter((r) => r.version === current) : [];
  return upTo.filter((r) => compareVersions(r.version, lastSeen) > 0);
}


/** The releases this computer has not seen yet (localStorage; an app with other saved settings was used before). */
export function pendingReleases(current: string): Release[] {
  try {
    const seen = localStorage.getItem(SEEN_KEY) ?? undefined;
    const usedBefore = Object.keys(localStorage).some((k) => k.startsWith('lvds.') && k !== SEEN_KEY);
    const out = unseenReleases(seen, current, usedBefore);
    if (!seen && !out.length) localStorage.setItem(SEEN_KEY, current); // a new install starts as seen
    return out;
  } catch {
    return [];
  }
}

