# M02 - Single Line Diagram (SLD)

<a id="SLD-010"></a>
## Purpose and data flow

Use the SLD workspace to build and review the electrical supply network from the
source through main boards, sub-main boards, DBs, and major equipment.

The SLD is not a separate drawing database. It displays the same boards, feeders,
loads, breakers, cables, and calculations used by schedules, studies, reports,
and the BOQ.

<a id="SLD-020"></a>
## Before starting

Confirm:

1. The project voltage, frequency, ambient conditions, and calculation limits.
2. The transformer or supply arrangement.
3. Required panel IDs, types, ratings, levels, and locations.
4. Available cable lengths or preliminary estimates.
5. The normal and standby supply concept.
6. Title-block and project information needed for drawing issue.

<a id="SLD-030"></a>
## Interface overview

Select the **SLD** tab, the third tab in the ribbon. **Stages > 2 Schematic > SLD** opens the same canvas. The SLD work area contains:

1. The panel tree on the left.
2. System, board, earthing, and riser view tabs, and the **Sheets** menu after them.
3. The interactive drawing canvas.
4. Drawing and zoom controls.
5. Board properties or circuit results on the right.
6. System, bus, and feeder results below the SLD.

The drawing sheets are in **Design CAD > Sheets**. The **Sheets** button on the
ribbon opens them. The **Sheets** menu after the view tabs (**Ctrl/Command+5**)
lists the sheets of the view on screen, then **All sheets**, **Sheet setup**,
**Title block and numbering**, and **Issues and transmittals**. Each item opens
that sheet or tab in **Design CAD > Sheets**. On the board view, **Make a sheet of
… on its own** adds the board's circuit-diagram sheet and opens it.

<a id="SLD-040"></a>
## Navigate the drawing

- Press **V** for the Select tool.
- Press **H** for the Pan tool.
- Scroll the mouse wheel, or pinch on a trackpad, to zoom at the pointer; two fingers on a trackpad pan.
- Press the wheel and drag, or hold **Space** and drag, to pan with any tool.
- Press **+** or **-** to zoom.
- Press **F** or **0** (or double-click the wheel) to fit the whole system diagram.
- Press **G** to change the grid: lines, dots, or none.
- Use the arrow keys to pan after focusing the drawing.
- The zoom is shown in the bottom-right corner; select it to fit. Design CAD and
  its Sheets use the same controls (in Design CAD, F7 changes the grid and FIT or
  ZE fits, because letters go to the command line).
- Use **Text: Auto** for zoom-dependent detail or **Text: All** for all labels.
- Use the full-screen control when reviewing a large network.

Click a board or feeder to select it. Double-click it, or press **F2** when
focused, to edit it.

Right-click a board, a load, a transformer, a bus coupler or the empty drawing
for its menu, or press **Shift+F10** (or the menu key) for the selection. The
menu lists what can be done there: edit, load schedule, add, copy, paste,
duplicate, order on the busbar, change a load's switching device, earth leakage,
kWh meter, phase or cable type, rename a board, delete, show on plan, zoom to
and properties. On the empty drawing it holds undo, add, fit, grid, text, values,
colour by, scenario and export. Keys on the drawing: **Z** zooms to the selection,
**Alt+Left** and **Alt+Right** move it along its busbar, **Ctrl+D** duplicates it.
**Move** (**M**) moves a board or a load: click the busbar to put it on, or a load to
place it before that one; Esc or a right-click cancels. **Supply from…** and
**Move to board…** pick the board from a list instead. A board moved to another source
gets **len?** under its values until its incomer length is checked.
On a first board (one with no board above it, no transformer and not a meter cabinet), **Add upstream board…** makes the board that feeds it (a DB gets an SMDB, an SMDB an MDB, an MDB a transformer): the incoming cable you typed becomes the way to it and the values given from upstream move to the new board. **Connect to…** joins it to a board already in the project instead; both are one undo step.
**Show this branch only** (on a board) dims everything not fed from it, on screen only;
**Esc**, or **Show everything** on the empty drawing, ends it. The Board tab has the same
right-click menus for its ways and sub-boards, without the tools that need the whole
drawing (Move, Supply from…, Zoom to, Select similar); the view stays on that board.

To work on several at once, **Shift+click** loads and boards, or **Shift+drag** a window on
the empty drawing (a plain drag still pans); **Esc** clears. A right-click on any picked
item opens one menu for all of them. **Edit together…** sets one field on every picked
load, with a before and after list and a warning for anything that would start failing,
as one undo step. **Select similar**, **Select everything below** and **Select** on the
empty drawing pick by load type, branch, failing circuits or board kind.

<a id="SLD-050"></a>
## Build the panel hierarchy

1. Select the board that will supply the new board.
2. Select **Boards**.
3. Enter the new board ID, name, type, and rating.
4. Confirm the supplying board.
5. Enter the incomer circuit ID, cable length, cores, size, breaker rating, and Icu.
6. Select **Add board**.

The app creates the downstream board and its incomer feeder together. Use
**Build hierarchy** to create several panels and connections in a batch.

To change an existing board's source, drag it onto the new parent in the panel
tree. Confirm the move, then check the incomer cable length.

<a id="SLD-060"></a>
## Add feeders and equipment

1. Select the supplying board.
2. Select **Add load** or choose a motor, solar PV, EV charger, or feeder cable
   from its menu.
3. Complete **General & load** with the circuit ID, name, type, connected load,
   demand factor, and power factor.
4. Identify essential, existing, standby, or generation equipment when applicable.
5. Complete **Cable** with length, cores, size, runs, installation method, type,
   and protective conductor.
6. Use **Suggest cable size** when automatic guidance is required.
7. Complete **Protection** and **Metering** as applicable.
8. Save the feeder.

The feeder summary shows design current, cable, protection, and total voltage
drop while editing.

<a id="SLD-070"></a>
## Edit and reconnect items

- Drag equipment from the equipment strip at the edge of the drawing onto a valid busbar or feeder target, or click it and then click the target. A category symbol opens its list; the pin keeps the list open.
- On the **Board** tab the same strip places items on that board: on its busbar for a new way, or on one of its ways. Its lists show only what the board can take.
- Or choose it on the ribbon: **Supply** (transformer, meter cabinet, generator, bus
  coupler) and **Devices** (protection, metering, capacitor bank) pick the same
  library items. Then click the target on the drawing.
- Any board type can be dropped on the empty canvas as a first board. Main boards (MDB, LV-MDB, LV-ACB) and meter cabinets are made as before; any other board starts as a first board fed from a board outside the project. Set its supply on the **Supply** tab. The busbar rules do not change.
- Drag an existing board, load, or incomer to another valid target to reconnect it.
- Use **Edit** or **F2** to change the selected item.
- Use **Delete** to remove the selected item after reviewing the confirmation.
- Use **Show on plan** (beside **Delete**) to see the selected board or circuit on its floor
  plan: Design CAD opens that level's drawing, zooms to it and picks the board's symbol,
  the circuit's devices or its drawn cable route. If it is not on a plan, the status line
  says what is missing.
- Use **Ctrl/Command+C** and **Ctrl/Command+V** to copy a board with everything
  below it and paste the branch under another board. **Copy** and **Paste** on the
  ribbon do the same.

Deleting a board also removes its downstream network.

<a id="SLD-080"></a>
## Board properties

Use the right-side tabs to review:

- **General**: identity, type, rating, busbar, and SLD display options.
- **Supply**: for a first board, what feeds it (a transformer, an LV source, a board outside the project, or not set) with the values that choice needs (a source's kind and name, the given fault level, drop already used, upstream device and incoming cable); for other boards, the upstream chain, incomer, fault level, and voltage drop.
- A new project asks where the SLD starts (step 2, **SLD start**): a final DB, a sub-main board, a main board on an LV source, a transformer and main board (the default), an RMU with one or two transformers, or an 11 kV ring with two substations. The two 11 kV starts open the MV supply and RMUs card after the project is made. Quick create keeps the transformer start, and the choice can be changed later on the board's **Supply** tab.
- On the 11 kV side, an RMU that feeds no transformer yet is drawn with its tee-offs marked **SPARE**. Right-click the RMU, or a spare tee-off, and choose **Add transformer and main board**: a new main board with a 1000 kVA transformer is put on the RMU, in its substation (set the kVA and impedance on its Supply tab). When the RMU is full the app asks first and offers to change RRT to RRTT, or RRTT to RRTTT. **Add ▸ RMU** on the empty drawing adds an RMU that feeds nothing yet.
- **Electrical**: voltage, fault level, power factor, and source.
- **Protection**: incomer device and protection checks.
- **Location**: building level, room, manufacturer, and installation information.

The loading section shows connected load, demand load, demand current, and the
percentage of the board rating in use.

<a id="SLD-090"></a>
## Run and review calculations

After changing electrical data, select **Run** or press **F5**.

Review:

- design current against breaker and cable capacity;
- total voltage drop;
- breaker Icu against calculated fault level;
- earth-fault performance and disconnection time;
- board and phase loading; and
- warnings or failed circuits in the results drawer.

Use **System summary**, **Bus voltages & loading**, and **Feeders on _panel_** to
review results. Correct the source data, then run calculations again.

<a id="SLD-100"></a>
## Operating and display controls

The diagram can show IEC symbols or simple icons, DEWA-style panel frames, cable
reference numbers, result layers, and different text detail levels.

Choose what the system diagram shows in the ribbon's **Results** group: **Values**
(current, bus voltage, voltage drop, fault current, power factor, loading),
**Colour by**, and **Scenario** (normal supply, on generator, or one transformer
out). The setting in use shows beside each name. **Check**, beside **Run**, counts
the circuits that fail or need checking and goes to the next one. On a narrow
window the ribbon groups that do not fit are under **More**.

Tick **Level and room** in **Values** to print the level and room under each DB and under
each board drawn as a symbol, and in the standard style under the name box of a panel.
DEWA-style panels already show them in their LOC row. A board with neither shows "Not on
a plan" on the screen; a drawing sheet prints the line only when its own **Level and room**
tick is on.

Display choices help prepare and review drawings but do not replace electrical
validation. If the diagram shows calculated labels, run calculations before export.

<a id="SLD-110"></a>
## Create drawing sheets

The SLD is the full editable network. The controlled drawing sheets are in
**Design CAD > Sheets**: SLDs, risers, and the earthing schematic, earth riser, and
floor earthing sheets.

1. Select **Sheets** on the ribbon, the **Sheets** menu after the view tabs, or
   **Design CAD > Sheets**.
2. Select **+ New sheet** above the sheet list.
3. Choose **Panel and its branch** (pick the panel), **Empty sheet**, a riser or
   earthing option, or **Split all panels into sheets**.
4. Check the sheet title, number, paper size, panel allocation, cable labels,
   printed result layers, status, and revision.
5. Use **Side by side** to see the design with each sheet's panels outlined. Drag
   a panel onto another outline to move it to that sheet.

Right-click a sheet in the list to rename, renumber, duplicate, move, revise,
export, or delete it. Add clouds, notes, and callouts with the **Markup** tools on
the ribbon; new markups are black. Publish and export the open sheet from the
ribbon's **Issue and export** group.

<a id="SLD-120"></a>
## Export drawings

For a quick export of the complete system diagram, select **Export** on the ribbon,
complete the title-block details, and export SVG, DXF, or PDF.

For a controlled drawing set, open **Documents > Drawings**. Preview the sheets and
export a combined PDF, PDF per sheet, DXF per sheet, a ZIP package, or the drawing
register.

<a id="SLD-130"></a>
## Validation and review

Before issuing drawings, confirm:

- every panel has the correct upstream source;
- panel and circuit IDs are unique and meaningful;
- incomer and feeder lengths are credible;
- load schedules and MD forms are complete;
- calculations are current;
- failed and warning checks have been resolved or documented;
- panels are allocated to the correct sheets;
- drawing numbers, titles, revisions, statuses, and title blocks are complete; and
- the exported files have been previewed.

<a id="SLD-140"></a>
## Troubleshooting

### Results are marked out of date

Press **F5** after the latest design change.

### A board is supplied from the wrong panel

Drag it to the correct parent in the panel tree, then review its incomer length.

### Detail disappears when zoomed out

Zoom in or switch from **Text: Auto** to **Text: All**.

### A drawing sheet is empty

Edit the sheet's panel selection or recreate it from **Panel and its branch** in **Design CAD > Sheets**.

### A DB's final circuits are not drawn individually

Open its load schedule. The system SLD represents DB final circuits with a summary;
use a DB circuit diagram sheet when individual circuits must be shown.

<a id="SLD-150"></a>
## Completion checklist

- [ ] Supply hierarchy complete
- [ ] Board properties complete
- [ ] Feeders and major equipment complete
- [ ] Cable and protection information reviewed
- [ ] Load schedules complete
- [ ] Calculations run and reviewed
- [ ] Drawing sheets allocated and previewed
- [ ] Drawing metadata complete
- [ ] Project saved
- [ ] Required drawing outputs generated

