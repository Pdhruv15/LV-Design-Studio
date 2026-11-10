/** What each release added, in plain words, for the What's new window shown once after an update (and from Help).
 * Add the new version at the top of RELEASES with each release batch, one line per feature. */

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

const SEEN_KEY = 'lvds.whatsNewSeen';

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

export function markSeen(current: string): void {
  try { localStorage.setItem(SEEN_KEY, current); } catch { /* storage refused: shown again next time */ }
}
