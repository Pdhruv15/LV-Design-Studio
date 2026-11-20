# SLD by substation, RMU and transformer — proposal (2026-11-18)

Status: **all eight decisions approved with the recommended answers**: 1–7 on 2026-11-18, 8 (the MV overview as a Show menu row, no new tab) on 2026-11-19. Step 1 (the ring on the SLD and the two fixes) was merged in PR 697, v2.208; the normally open point waits for step 4, where it is entered. PR 698 (v2.209, merged) renamed the app's older HV labels to MV, among them the MV supply and RMUs card and menu item named here. Step 2 (Show, the chip, the MV overview row and right-click Show) was merged in PR 701, v2.212; the optional Colour by → Transformer is left out. Step 3 (the panel tree's Group switch) was merged in PR 703, v2.214. Step 4 (the Substations card, right-click Substation / RMU / Configuration / Normally open, and the normally open point) was merged in PR 710, v2.221. Step 5 (One sheet per substation, with the MV overview sheet and its RMU and transformer schedules) is in PR 711, v2.222.
Mockup: `docs/mockups/sld-substation-view-mockup.html` + `.png` (example project: five substations, six RMUs, seven transformers and one board on an authority LV supply).
Follows [[UI UX proposals - 2026-11-11 - SLD supply sources, RMU and package substations]]: that proposal's D1 (where the upstream chain is drawn) is answered here with "above the main boards, by substation".

## What was asked

- Show each transformer's tree on its own on the SLD.
- Draw a different arrangement per substation: one RMU feeding two transformers, one RMU feeding one, and other combinations.
- With five substations, show the SLD by substation, by RMU or by transformer.

## Today (main, v2.203)

- The SLD draws one utility symbol and one 11 kV line along the top. Every transformer hangs from that line. A board on an authority LV supply (meter cabinet) is drawn on it too: its supply line crosses the 11 kV line. RMUs are boxes laid over the same line. Their ways (R / T) and the ring between them are not drawn. Only the first grid source is drawn (`SystemDiagram.tsx`, "Utility and transformers" and "RMUs").
- Most of the data exists already. Each main board names its RMU (`Board.rmu`) and its substation (`Board.substation`), both set in Panels → Transformers. `project.rmus` holds each RMU's configuration (RT, RRT, RRTT, RRRT, RRTTT) and ratings, and `project.gridSources` holds the MV supplies. The substation name is already used by the TCL summary form, the earthing schematic (laid out substation by substation), the BOQ's RMU lines and the dashboard's substation count. The SLD does not use it.
- The SLD page always shows the whole network. The panel tree lists the main boards flat.
- Design CAD → Sheets can split the SLD by panels, make one sheet per MDB, or make an overview + one per SMDB, but not one sheet per substation. A per-MDB sheet drops the bus coupler between two main boards of the same substation (`sheetProject` keeps a tie only when both boards are on the sheet).
- Two inconsistencies:
  - Panels → Transformers allows at most two transformers per RMU, whatever the configuration (RRT has one tee-off, RRTTT has three). `rmuChecks` does compare with the configuration.
  - Substation area → Fill from project makes one substation per RMU (`substationsFromProject`), so a substation with two RMUs becomes two.

## Where it goes in the app

No new tab. The mockup's section 0 shows each place.

1. **SLD → System diagram**, the first of the SLD page's four tabs: the drawing itself shows the arrangement (part 1). Board, Earthing and Riser stay as they are.
2. **SLD ribbon → View → Show**, beside Fit. The chip sits on the drawing (part 2).
3. **Panel tree**, on the left of the SLD page: the Group switch (part 3).
4. **Panels → Transformers**, opened from SLD ribbon → Supply → MV supply and RMUs… as today: the Substations card (part 4). Right-click works on the drawing.
5. **Design CAD → Sheets → Make the sheets automatically**: a fourth button, One sheet per substation (part 5). Since v2.4 every submission sheet is made there, not on the SLD page.

## Proposal

### 1. Draw the supply arrangement (screen and sheets)

- Main boards are placed left to right by substation, then by RMU. Inside a group the order stays as today.
- The 11 kV ring runs from the grid source through the RMUs in substation order, with "from" and "to" labels at its two ends. Each grid source has its own ring: an RMU's source picks the ring it is on. Today only the first source is drawn.
- Each RMU is drawn with its ways: the ring switches at both ends and the tee-offs between them. The tee-off device comes from the RMU record: a switch-fuse with its fuse rating, or a circuit breaker with relay 50/51, 50N/51N. A tee-off with no transformer is drawn as SPARE.
- The normally open point is optional. Where it is entered, that ring switch is drawn open and marked N/O.
- Each named substation is framed with a dash-dot line around its RMU(s) and transformers, titled at the top, e.g. "SS-1 · Conventional · Ground floor".
- Transformers sit under their tee-offs. Main boards and everything below them stay as today.
- A board on an authority LV supply gets its own source ("DEWA LV supply") and is no longer drawn on the 11 kV line.
- The combinations this covers:
  - one RMU → one transformer (RRT);
  - one RMU → two transformers (RRTT);
  - two RMUs in one substation;
  - a spare tee-off;
  - several substations on one ring;
  - two rings.
- Sheets print in black and white. DXF and DWG get the same lines.

### 2. Show: whole network, substation, RMU or transformer (screen)

- SLD ribbon → View: a new **Show** menu beside Values, Colour by and Scenario. The menu is the supply tree: Whole network, MV overview, then each substation, its RMUs and their transformers (with kVA and main board), each row with its board count. Any row can be picked.
- MV overview (decision 8) draws only the MV side: the source, the ring, the substations with their RMUs and transformers, and each main board as a name, like sheet E-SLD-001. Double-click a substation frame there to show that substation.
- The drawing then shows only that part:
  - its piece of the ring, as stubs ("from DEWA primary S/S", "to RMU-2 · SS-2");
  - its RMU(s), transformer(s) and main board(s), with everything they feed.
- Anything outside the part is drawn as a stub. A bus coupler to a board not shown becomes "to MDB-5 (TX-5)". When one transformer is shown, the other tee-offs of its RMU become stubs.
- A chip at the drawing's top left says what is shown, e.g. "Showing SS-1 · 2 transformers · 18 boards". It has ◀ ▶ for the previous / next item of the same kind (substation, RMU or transformer) and Show all.
- Right-click a substation frame, an RMU or a transformer → Show … only.
- Show changes only the view. The calculations, checks, results and fault levels are still those of the whole network. Fit fits the shown part. Export exports what is shown, titled e.g. "SLD — SS-1".
- Optional: Colour by → Transformer, with each transformer's branch in its own colour on screen. Sheets print black, as with Colour by → Supply.

### 3. Panel tree by substation (screen)

- A Group switch at the top of the panel tree: Boards (today) or Substations.
- Substations gives SS-1 → RMU-1 · RRTT → MDB-1 (TX-1 · 1000 kVA) → its boards. Main boards with no substation go under "No substation", authority LV supplies under "Authority supply".
- On the SLD page, a click on a substation or RMU row shows that part. A click on a board selects it, and a double-click opens it, as today.

### 4. Enter the arrangement

- Panels → Transformers gets a new **Substations** card with one row per substation, in ring order. Each row has the name, type (the DM-D-013 types), location, RMUs with their configuration, transformers and owner. The card has + Substation, and ▲ ▼ to change the order.
- The RMU column of the transformer table takes its limit from the RMU's tee-offs (RT / RRT 1, RRTT 2, RRTTT 3) instead of a fixed 2. A new RMU starts as RRT. Putting a second transformer on it suggests RRTT.
- On the SLD:
  - right-click a transformer → Substation ▸ or RMU ▸ (the RMU list shows free tee-offs);
  - right-click an RMU → Configuration ▸ or Normally open.
- Model:
  - The substation stays a name on the main board, so old projects open unchanged.
  - Its details go in a substation record (decision 6).
  - New optional fields: `Rmu.substation`, for an RMU with no transformer yet, and `Rmu.normallyOpen`.

### 5. Sheets per substation

- Design CAD → Sheets → Make the sheets automatically gets a fourth button, **One sheet per substation**, beside Split by panels, One sheet per MDB and Overview + one per SMDB:
  - first an MV overview sheet: the source, the ring, the substations, RMUs and transformers, and each main board's name with "sheet E-SLD-00n". Under the drawing, an RMU schedule and a transformer schedule list the ratings;
  - then one sheet per substation, with its main boards and everything they feed. A bus coupler between those main boards stays on the sheet.
- One sheet per MDB stays. Each of its sheets also draws the transformer's RMU, with the other ways as stubs.

## Checks added

- An RMU that feeds transformers in two substations (warning).
- More transformers on an RMU than it has tee-offs. `rmuChecks` already does this; the SLD would also show it.
- More transformers in a substation than its DM-D-013 type allows (pocket type 2, open roof 1).
- Substation area → Fill from project makes one substation per substation name, and falls back to one per RMU (as today) where a board has no substation name.

## Steps

1. The supply arrangement on the SLD (part 1), plus the two fixes: the RMU limit from the configuration, and Fill from project by substation name.
2. Show, the chip, the MV overview row and right-click Show (part 2).
3. The panel tree by substation (part 3).
4. The Substations card, and right-click Substation / RMU (part 4).
5. One sheet per substation (part 5).

Each step is one PR, with tests.

## Decisions

All eight were answered with the recommended answers: 1–7 on 2026-11-18, 8 on 2026-11-19.

1. **Substation frame:** around the RMU(s) and transformers (recommended), or down to the main board's incomer.
2. **Ring:** an open line through the RMUs with "from" / "to" labels (recommended), or a closed loop back to the source.
3. **Show menu:** one supply tree, substation → RMU → transformer (recommended), or three separate lists.
4. **A board outside the shown part is picked** (panel tree, Check, Find): show its substation (recommended), or the whole network.
5. **Panel tree:** add the Group switch with Boards as the default (recommended), or leave the tree as it is.
6. **Substation details:** one record shared with the DM-D-013 Substation area page, which already holds the name, type, transformer count, kVA and building (recommended), or a separate list.
7. **Order:** steps 1 → 5 as listed (recommended), or Show first (step 2 before step 1).
8. **MV-only view:** the ring, substations, RMUs and transformers, with each main board as a name, like sheet E-SLD-001. Either an MV overview row in the Show menu on the System diagram tab (recommended, approved 2026-11-19), or a fifth SLD tab, MV supply, after Riser.
