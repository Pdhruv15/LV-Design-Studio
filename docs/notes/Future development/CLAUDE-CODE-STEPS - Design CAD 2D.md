# Design CAD 2D gap plan — Claude Code steps

How to use: one step = one fresh Claude Code session = one branch and PR.
Say: "Read docs/notes/Future development/CLAUDE-CODE-STEPS - Design CAD 2D.md and do Step N."
Do the steps in order. Step 0 must be merged first (it is the UI approval required by AGENTS.md).
Mockups: see the HTML guide "LV-Design-Suite-Claude-Code-Step-by-Step.html" in the same folder.

---

## Step 0 — Commit the approved UI proposal
Branch: `docs/cad-2d-gap-proposal`

```text
Read AGENTS.md first and follow it.

Task: documentation only. No code changes.

Create the file:
  docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md

It is the approved UI/UX spec for the next Design CAD 2D drafting features. Structure it as numbered sections
S1 … S25, one per feature below. Each section has: the ribbon place (tab / panel / button or dropdown entry),
the typed command and aliases, the command-line prompts in order, any dialog with its fields, and right-click
menu entries. Match the existing ribbon wording style in src/components/Ribbon.tsx (short label, tooltip
"Name (ALIAS): what to do").

First, read these existing proposals and reference them instead of repeating them:
  - UI UX proposals - 2026-11-08 - Annotate sub-tab.md          (MTEXT notes, dims)
  - UI UX proposals - 2026-11-08 - CAD selection shortcuts and tracking.md
  - UI UX proposals - 2026-11-08 - CAD underlays and calibration.md
  - UI UX proposals - 2026-11-08 - Hatch editing and pattern library.md

Sections:
S1  Clipboard: Ctrl+C, Ctrl+Shift+C (copy with base point, COPYBASE), Ctrl+V (PASTECLIP), PASTEORIG; right-click menu "Clipboard ▸"
S2  ZOOM W / P / S / E on the command line and in the zoom chip's menu; view history of 20
S3  Quick Select (QSELECT) dialog: Apply to, Object type, Property, Operator, Value, Include/Exclude; SELECTSIMILAR on right-click
S4  Dimension dropdown adds Radius (DRA, DIMRADIUS), Diameter (DDI, DIMDIAMETER), Angular (DAN, DIMANGULAR)
S5  Double-click a text or dimension to edit it in place; Enter commits, Esc cancels
S6  MTEXT (MT, MTEXT): box by two corners, in-place editor with B / U / height / justify; T and DT stay single-line
S7  Draw order (DR, DRAWORDER): Bring to front, Send to back, Above object, Under object, TEXTTOFRONT; right-click "Draw order ▸"
S8  POINT (PO), DIVIDE (DIV), MEASURE (ME), and the Point style dialog (PTYPE)
S9  BLOCK (B): Block definition dialog (name, base point, objects, retain / convert / delete, description)
S10 INSERT of user blocks: "Blocks" palette with Current drawing / Recent / Library folder tabs; device insert keeps DEV
S11 ATTDEF (ATT) dialog; ATTEDIT / EATTEDIT dialog on double-click of a block with attributes
S12 MLEADER (MLD) and MLEADERSTYLE (MLS); MLEADERALIGN, MLEADERCOLLECT
S13 TABLE (TB) insert dialog and in-place cell editing
S14 FIND dialog: Find / Replace with, Search in (drawn text, attributes, dims), Find next / Replace all
S15 WIPEOUT (WIPEOUT): polygon or from a closed polyline; frames on / off
S16 PURGE dialog: unused blocks, layers, text styles, dim styles, linetypes
S17 Annotation scale on the status bar; annotative toggle in text, dim, mleader and hatch styles
S18 SPLINE (SPL) fit points / control vertices; SPLINEDIT (SPE)
S19 PEDIT (PE) options; LENGTHEN (LEN) DElta / Percent / Total / DYnamic
S20 BOUNDARY (BO), REGION (REG); associative hatch (see the hatch proposal)
S21 Associative dimensions: they follow the geometry; DIMREASSOCIATE (DRE)
S22 Fence (F), Lasso, Previous (P) selection; selection cycling (see the selection proposal)
S23 IMAGEATTACH / PDFATTACH (see the underlays proposal)
S24 UCS (UCS: World, 3-point, Object, Previous) with the axis icon; VIEW named views dialog
S25 BEDIT block editor tab (Save block / Close / Attribute definition)

Also add a short "Out of scope" list: dynamic blocks, parametric constraints, 3D.

Branch: git fetch origin main && git checkout -b docs/cad-2d-gap-proposal origin/main
Commit, push, open a PR titled "docs: Design CAD 2D gap plan UI/UX proposal (S1–S25)". Do not merge.
```

---

# Phase 1 — Everyday drafting comfort

## Step 1 — Clipboard: copy and paste between drawings and levels (P1)
Branch: `feat/cad-clipboard` · Spec: S1

Ctrl+C / Ctrl+V for drawn objects, with base point and original-coordinates options. This is the biggest daily time-saver, for example copying a typical floor to the next level.

```text
Feature: clipboard for Design CAD drawn objects (spec S1).

Build:
1. src/model/cadClipboard.ts (pure): serialise SketchItem[] plus a base point to a versioned JSON payload { app:'lvds-cad', v:1, units:<INSUNITS>, base:[x,y], items:[...] }, and parse it back with strict validation (reuse src/util/sanitize.ts patterns; reject unknown kinds). Paste: offset the items to the insertion point, convert units when the source and target drawings differ (cadUnits.ts), give new IDs (addSketch), and keep layer names (create a missing layer with the same style through the cadLayerState helpers).
2. Commands in cadCommands.ts: COPYCLIP (Ctrl+C), COPYBASE (Ctrl+Shift+C: asks for a base point first), PASTECLIP (Ctrl+V: asks for an insertion point with a live preview), PASTEORIG (same coordinates; refused in the same drawing). Use navigator.clipboard when available, with an in-memory fallback so copy-paste works between tabs in the app even if the system clipboard is blocked.
3. Keyboard: hook into the existing keydown handler in CadPage.tsx (around the window keydown listener). Don't take over Ctrl+C/V while focus is in an input, the command line or a dialog.
4. Right-click menu: "Clipboard ▸" with the four entries, as in S1.
5. Devices, trays and cable routes: copy only the drawn geometry. Tray/cable metadata pastes as plain polylines unless the paste is in the same drawing. Say so in the command line.
6. Tests: payload round trip, unit conversion mm↔m, invalid payload rejected, IDs unique, one undo step per paste.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-clipboard origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S1. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 2 — ZOOM Window / Previous / Scale (P1)
Branch: `feat/cad-zoom-window-previous` · Spec: S2

Zoom to a window you drag, step back through views, or zoom by a scale factor. Today there is only Fit, wheel zoom and pan.

```text
Feature: ZOOM Window / Previous / Scale in Design CAD (spec S2).

Build:
1. src/components/drawingView.tsx (or a new pure helper beside it): a view history of the last 20 views per open drawing (centre + scale), pushed on every zoom/pan change after a 400 ms pause so wheel zooms don't flood it. Pure functions + tests: windowToView(box, viewport) and scaleView(view, factor | "2x" relative).
2. Commands: Z / ZOOM shows options [Window/Previous/Scale/Extents]. Z W, ZOOM W: two corners, with a live rubber-band rectangle on CadCanvas. Z P: previous view. Z S: a factor typed ("2", "0.5", "2x"). Keep the existing FIT / ZE / Z E aliases working exactly as now.
3. Add Window, Previous and Scale… to the zoom chip menu (ZoomChip) as in S2.
4. Layouts: inside a layout's paper space, the zoom changes the paper view, not a viewport's scale.
5. Tests: history cap and order, window math with non-square viewports, Previous at an empty history does nothing, and a message on the command line.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-zoom-window-previous origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S2. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 3 — Quick Select (QSELECT) and Select Similar (P1)
Branch: `feat/cad-qselect` · Spec: S3

Select every object that matches a filter (all text on E-POWER, every circle with R = 150) or everything like the object picked.

```text
Feature: QSELECT dialog and SELECTSIMILAR (spec S3).

Build:
1. src/model/cadQuickSelect.ts (pure): filter SketchItem[] by kind and by a property from the same field list the properties palette uses (cadProps.ts), with the operators = , ≠ , > , < , *wildcard (* and ?), and "Select all". Include / exclude, and append to the current selection. SELECTSIMILAR: same kind + same layer (+ same text style for text, same dim style for dims), as in S3.
2. Dialog component in src/components/cad (match CadDialogs.tsx look): Apply to (entire drawing / current selection), Object type (the kinds present, with counts), Properties list, Operator, Value (dropdown of the existing values for layer, colour, linetype), and How to apply.
3. Commands: QSELECT; SELECTSIMILAR (also on the right-click menu when something is picked). The result goes into the existing selection state, so Move, Erase, properties and so on act on it.
4. Only drawn objects (the architect's drawing is never selectable for editing). Devices are not included in v1. Note that in the PR text.
5. Tests: each operator, the wildcard, numeric compare in drawing units, include/exclude/append, empty result message.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-qselect origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S3. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 4 — Radius, diameter and angular dimensions (P1)
Branch: `feat/cad-radial-angular-dims` · Spec: S4

Finish the dimension set right after PR #462 while that code is still fresh. They use the current dimension style.

```text
Feature: DIMRADIUS, DIMDIAMETER, DIMANGULAR (spec S4). Builds on PR #462 (linear/continue/baseline).

Build:
1. Data model: extend SketchItem 'dim' with a subtype field, e.g. dimKind?: 'aligned'|'linear'|'radius'|'diameter'|'angular' (missing = today's behaviour; no migration needed). Radius/diameter store the centre, the point on the circle and the text position. Angular stores vertex, two points and the arc position (or the arc's centre and ends).
2. Geometry in src/model/cadSketch.ts beside dimensionLines(): radialDimLines() and angularDimLines() returning lines/arcs/arrows/text the same shape the canvas and print already use. Text: "R550" / "Ø1100" / "40°" with the dim style's precision and unit factor. Text inside or outside following DimTextPos.
3. Commands: DRA / DIMRADIUS, DDI / DIMDIAMETER (pick a drawn circle or arc, or an architect circle via snap), DAN / DIMANGULAR (two lines, an arc, or vertex + 2 points). Add them to the Dimension dropdown in Ribbon.tsx as in S4.
4. Grips: the text position moves. The properties palette shows the measured value (read-only) and the text override.
5. DXF/DWG: write as native DIMENSION types (radius = 4, diameter = 3, angular 3-point = 5 / 2-line = 2) with the block of exploded geometry. Round-trip test with the engine.
6. Tests: values for known geometry, the angle quadrant chosen by the cursor side, degree precision, print output lines present.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-radial-angular-dims origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S4. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 5 — Double-click to edit text in place (P1)
Branch: `feat/cad-text-inplace-edit` · Spec: S5

Double-click a text or dimension on the canvas and type over it, as in current industrial 2D drafting products.

```text
Feature: in-place text edit on double-click (spec S5).

Build:
1. CadCanvas.tsx: on a left double-click over a drawn 'text' or 'dim' item (use the existing hit test), call an onEditText(id) prop. Keep middle-button double-click = fit, exactly as now.
2. CadPage.tsx: show an absolutely positioned input over the text, scaled to its screen height and rotated with it, in the existing input style. Enter commits (one undo step), Esc cancels, a click outside commits. For a dimension, edit the text override. Empty means "measured value", with "<>" standing for the measured value.
3. Also accept the typed commands TEXTEDIT / DDEDIT / ED (then pick).
4. Locked layers: refuse with a command-line message.
5. Tests: the commit/cancel logic as a pure function (cadSketch.ts: withText(item, s)), dim override "<> mm" keeps the measured value, and an undo step count of 1.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-text-inplace-edit origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S5. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 6 — MTEXT — multi-line notes (P1)
Branch: `feat/cad-mtext` · Spec: S6 (+ Annotate sub-tab proposal)

Paragraph text in a width box with wrapping, bold and underline, height and justification. Needed before multileaders and tables.

```text
Feature: MTEXT multi-line text (spec S6; also read "UI UX proposals - 2026-11-08 - Annotate sub-tab.md", item 2 "Notes (MT)").

Build:
1. Data model: a new SketchItem kind 'mtext' with pts[0] = insertion corner, width (drawing units), h, rot, attachment ('TL'|'TC'|'TR'|'ML'|'MC'|'MR'|'BL'|'BC'|'BR'), lineSpacing, style, and text stored as a small, safe run format: paragraphs of runs {s, b?, u?, h?} plus numbered/bulleted paragraphs. No HTML is stored. Add it to the union in src/types.ts and to projectMigrate if it is needed.
2. src/model/cadMtext.ts (pure): word wrap to the width using a measure function passed in (canvas measureText in the app, a fixed-width stub in tests), line layout, and toDxfMtext() / fromDxfMtext() for the \P \L \l \H \f codes. Tests for wrap, attachment offsets and the DXF codes round trip.
3. Commands: MT / MTEXT. T and DT stay single-line TEXT (change the 'MT' alias from the text tool to the new tool). Two corners give the width, then the in-place editor appears (S6 toolbar: style, height, B, U, justify, spacing, list, OK). Double-click an mtext to edit it again (reuse step 5's in-place edit plumbing).
4. Canvas draw, snap (insertion + box corners), grips (move + width handle), properties palette (contents, height, width, attachment, rotation, style), MATCHPROP, EXPLODE (→ one single-line text per line), DXF/DWG write as MTEXT, print on plan sheets and PDF in black and white.
5. FIND in step 14 will need to search it, so expose a plainText(item) helper.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-mtext origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S6. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 7 — Draw order (P1)
Branch: `feat/cad-draworder` · Spec: S7

Bring to front or send to back, so solid hatches and wipeouts don't hide symbols and text.

```text
Feature: DRAWORDER and TEXTTOFRONT (spec S7).

Build:
1. Draw order = the order of items in the drawing's sketch list (src/model/cadSketch.ts). Add pure helpers: toFront(items, ids), toBack(items, ids), above(items, ids, refId), under(items, ids, refId), textToFront(items) (text, mtext and dims after everything else). Keep relative order inside the moved group.
2. CadCanvas.tsx: make sure drawn items paint in list order (fills first is not allowed to override it), and that the architect's drawing stays underneath all drawn items.
3. Commands: DR / DRAWORDER with options, TEXTTOFRONT. Right-click "Draw order ▸" submenu as in S7. One undo step each.
4. DXF/DWG: write a SORTENTSTABLE for model space, or write the entities in that order if the writer can't do the table. Explain the choice in the PR. Plan-sheet print and PDF follow the same order.
5. Tests: each helper, a stable group order, and a print order that matches the list.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-draworder origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S7. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 8 — POINT, DIVIDE, MEASURE and Point style (P1)
Branch: `feat/cad-point-divide-measure` · Spec: S8

Equal spacing along any line, arc or route: points, or user blocks later (step 10). Good for setting out lights along a corridor.

```text
Feature: POINT, DIVIDE, MEASURE and the Point style dialog (spec S8).

Build:
1. A new SketchItem kind 'point' (pts[0]). The look comes from a per-drawing point style {mode, sizeMm}, like PDMODE / PDSIZE, kept with the drawing's other styles (src/model/cadStyles.ts).
2. src/model/cadSketch.ts (pure): pointsAlong(item, n) for DIVIDE (n segments → n-1 points; a closed shape → n points) and pointsEvery(item, d) for MEASURE (from the end nearest the pick). Works on line, pline (incl. trays and cable routes), arc, circle, ellipse. Option "Align" gives each point the tangent angle (used later for blocks).
3. Commands: PO / POINT (multiple until Enter), DIV / DIVIDE, ME / MEASURE, PTYPE / DDPTYPE (dialog as in S8). The [Block] option is shown but answers "Blocks come with BLOCK/INSERT (step 10)" until then. Leave a clear TODO hook.
4. Node snap must find drawn points (OSNAP_BITS.node already exists). Canvas, print, DXF POINT entities with $PDMODE / $PDSIZE header variables, and a round-trip test.
5. Tests: divide 10 m by 5 → 4 points at 2 m spacing, measure 10 m every 3 m → 3 points, arcs and a closed polyline.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-point-divide-measure origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S8. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

---

# Phase 2 — Blocks, attributes & IFC annotation

## Step 9 — BLOCK — make a block from drawn objects (P1)
Branch: `feat/cad-block-define` · Spec: S9

Turn your own drawn lines and text into a named reusable block, such as a custom isolator or a DB symbol.

```text
Feature: user block definitions (spec S9). Step 1 of 3 for blocks (then insert, then attributes).

Build:
1. Data model: a project-level (per-drawing) block table: CadBlockDef { name, base:[x,y], units, description, items: SketchItem[] (relative to base), annotative?, explodable }. A new SketchItem kind 'insert' with pts[0] = insertion, block name, sx, sy, rot. Add both to src/types.ts and projectMigrate (schemaVersion bump).
2. src/model/cadBlocks.ts (pure): defineBlock(items, base) → def; expandInsert(insert, def) → world SketchItems (used by canvas, snap, print, explode and export); bounds; name validation (no < > / \ " : ; ? * | = and backtick, and unique case-insensitively, also against the architect's block names from the engine).
3. BLOCK / B command + dialog (S9): name, base point (pick or typed), objects (pick), Retain / Convert / Delete, units, description, allow exploding. "Convert" replaces the picked items with one insert.
4. 'insert' everywhere: canvas (draw the expanded items; layer "0" items take the insert's layer, ByBlock colour), insertion snap, grips (insertion point), move/copy/rotate/scale/mirror, properties (name, X, Y, scale, rotation), EXPLODE (→ the items in world coordinates), erase, undo.
5. DXF/DWG write: BLOCK records + INSERT entities. The read side already shows architect blocks; make sure a saved then reopened drawing shows the block once (no duplicates). Round-trip test.
6. Don't change what INSERT / I / DEV do yet. That is step 10.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-block-define origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S9. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 10 — INSERT user blocks + Blocks palette (P1)
Branch: `feat/cad-block-insert` · Spec: S10

A palette to insert blocks from this drawing, recent blocks, or a library folder of DWGs (your standard symbols).

```text
Feature: insert user blocks and the Blocks palette (spec S10). Needs step 9 merged.

Build:
1. Command change (important): today INSERT / I go to the device tool. Per S10, keep DEV / DEVICE for devices. INSERT / I now opens the Blocks palette. Update cadCommands.ts, the HELP list, the tooltips and whatsNew.ts ("INSERT now inserts blocks; devices are DEV").
2. A Blocks palette docked like the layer palette (reuse its dock/toggle pattern): tabs Current drawing (this drawing's user blocks + the architect's blocks from the engine, read-only defs), Recent (localStorage, guarded with try/catch), Library (a folder chosen in Preferences; the desktop app lists the DWG/DXF there through the existing electron file IPC; the web version uses a file picker). Search box, thumbnails rendered from expanded geometry to a small canvas, scale / rotation / explode options.
3. Placing: live preview at the cursor, Basepoint / Scale / Rotate options, multiple inserts until Esc. A whole DWG from Library inserts as a block named after the file (its model space via the engine).
4. DIVIDE / MEASURE [Block] option from step 8: now works (with the Align option).
5. Tests: insert transform math, the alias change, Recent list cap of 12, and a library file turned into a def via an engine fixture.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-block-insert origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S10. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 11 — Attributes: ATTDEF and ATTEDIT (P2)
Branch: `feat/cad-block-attributes` · Spec: S11

Tags on blocks (circuit, load, height) that you edit with a double-click. This links your drafting to the load-schedule data.

```text
Feature: block attributes (spec S11). Needs steps 9–10 merged.

Build:
1. Data model: a SketchItem kind 'attdef' (tag, prompt, default, flags invisible|constant|preset, text props) that lives inside block defs. On an 'insert': attrs?: Record<tag, string>. Constant attdefs are not stored per insert.
2. ATTDEF / ATT command + dialog (S11) places an attdef in the drawing. BLOCK (step 9) includes picked attdefs, and on insert asks for each non-preset attribute in prompt order on the command line (defaults in <>).
3. Double-click an insert with attributes → EATTEDIT dialog (S11): edit values and the text options. Typed commands ATTEDIT / EATTEDIT. Also add attributes to the properties palette for a single selected insert.
4. Canvas/print: attribute text drawn at the insert's transform, invisible ones hidden. FIND (step 14) will search values, so add plainText support.
5. Extraction: an "Attributes" table export (CSV and the existing Excel path: exceljs) of block, tag, value, layer, X, Y. Optional and off by default: a helper that can match CIRCUIT values to feeders in the project, as a report only. Don't write to the load schedule.
6. DXF/DWG: ATTDEF inside BLOCK, ATTRIB after INSERT with SEQEND. Round-trip test incl. invisible + constant.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-block-attributes origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S11. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 12 — Multileader (MLEADER) and styles (P2)
Branch: `feat/cad-mleader` · Spec: S12

Proper circuit callouts: arrow, landing and MTEXT content, with a style, plus align and collect.

```text
Feature: MLEADER, MLEADERSTYLE, MLEADERALIGN, MLEADERCOLLECT, plus add/remove leader (spec S12). Needs step 6 (MTEXT).

Build:
1. Data model: a SketchItem kind 'mleader': leaders: [x,y][][] (each a polyline ending at the landing), landing point, dogleg length, content {type:'mtext', mtext fields from step 6} or {type:'block', name, attrs}, and style name. A per-drawing MLeaderStyle {name, arrow, arrowSizeMm, landingGapMm, doglegMm, textStyle, textHeightMm, attachment}.
2. Pure geometry in src/model/cadMleader.ts: arrow + leader lines + dogleg + content placement, with the side chosen by where the content is. Tests.
3. Commands: MLD / MLEADER (arrow → landing → MTEXT editor from step 6), MLS / MLEADERSTYLE (dialog in the CadDialogs.tsx style), MLA / MLEADERALIGN, MLC / MLEADERCOLLECT (block content), AIMLEADEREDITADD / AIMLEADEREDITREMOVE (+ right-click "Add leader / Remove leader").
4. The existing LEADER tool stays as it is.
5. Everywhere-rules from the rules block; DXF/DWG as MULTILEADER (or exploded LEADER + MTEXT if the writer can't. Explain in the PR). Round-trip test.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-mleader origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S12. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 13 — TABLE on the drawing (P2)
Branch: `feat/cad-table` · Spec: S13

Legends and small schedules (symbol legend, cable summary) drawn as native tables on the plan.

```text
Feature: TABLE and TABLESTYLE (spec S13).

Build:
1. Data model: a SketchItem kind 'table': insertion (top-left), column widths[], row heights[], cells[r][c] {text (single mtext-run paragraph), align, merge?:{rows,cols}, blockName?}, and style. A per-drawing TableStyle {name, title/header/data text heights, margins, grid lineweight}.
2. Pure layout in src/model/cadTable.ts (cell boxes, merges, text positions, auto row height from wrapped text using the step-6 wrapper). Tests.
3. TB / TABLE dialog (S13): style, columns × width, rows, and From: Empty / Excel or CSV (reuse the existing exceljs import path) / Project legend (an option that fills symbol, description and count from devices placed on this level. Read-only copy; say it doesn't update itself). Click a cell to edit in place, Tab to move, right-click for insert/delete row/col and merge.
4. EXPLODE → lines + text. Print/PDF black and white. DXF/DWG: write as an exploded block (ACAD_TABLE is optional in this PR; if done, round-trip it). Note the choice in the PR.
5. Tests: merges, a column-width edit, the CSV import, and the explode count.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-table origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S13. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 14 — Find and replace (P2)
Branch: `feat/cad-find-replace` · Spec: S14

Rename DB-GF-01 to DB-G-01 across the whole floor: in text, MTEXT, dimension overrides, attributes, multileaders and tables.

```text
Feature: FIND / replace dialog (spec S14). Needs steps 6, 11, 12, 13 for the full search set. Search whatever
exists on main when you start and list the rest as follow-ups.

Build:
1. src/model/cadFind.ts (pure): search every drawn item's text fields via one plainText/withText interface per kind (text, mtext runs, dim override, attribute values, mleader content, table cells). Options: match case, whole words, wildcards (* ?). Return hits {id, field, context snippet}. Replace keeps mtext run formatting where the match is inside one run; across runs it uses the first run's format (document this).
2. Dialog (S14): results list, Zoom to (fits the hit), Find next, Replace, Replace all (one undo step).
3. The architect's drawing text is found (read-only, shown greyed, "can't replace: architect's drawing").
4. Tests: each kind, case/whole/wildcard, run splitting, undo count.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-find-replace origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S14. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 15 — WIPEOUT (P2)
Branch: `feat/cad-wipeout` · Spec: S15

Mask the architect's busy lines behind notes and tags so they stay readable on print.

```text
Feature: WIPEOUT (spec S15). Needs step 7 (draw order) merged.

Build:
1. A SketchItem kind 'wipeout' (closed polygon pts). It paints with the background colour on screen and white on paper/PDF, above the architect's drawing and in draw order among drawn items (new wipeouts go just under text).
2. Commands: WIPEOUT: pick points, or Polyline (pick a closed drawn pline, with an option to erase it). Frames: On / Off / Display but not plot (a per-drawing setting).
3. Everywhere-rules; DXF/DWG as WIPEOUT (with the WIPEOUTVARIABLES dictionary if needed) or a solid HATCH in the background colour as fallback. Explain in the PR. Round-trip test.
4. Tests: masking order in the print path, frame modes.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-wipeout origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S15. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 16 — PURGE (P2)
Branch: `feat/cad-purge` · Spec: S16

Clean unused blocks, layers and styles before issue.

```text
Feature: PURGE (spec S16).

Build:
1. src/model/cadPurge.ts (pure): find the unused user block defs (nested use counts), drawn layers with no objects (never layer 0, the current layer, layers used by devices/trays/routes, layers in layer states or viewport freezes), and unused text, dim, mleader and table styles (never the current ones). Purge returns the new project. Nested: repeat until nothing changes.
2. PU / PURGE dialog (S16). One undo step.
3. Tests: nested block, current-layer protection, device layers protected, style in use protected.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-purge origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S16. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 17 — Annotation scale (annotative objects) (P2)
Branch: `feat/cad-annotative-scale` · Spec: S17

Draw text once at the paper height. It appears at the right size at 1:50 and 1:100 in layouts.

```text
Feature: annotative scale (spec S17).

Build:
1. A per-drawing current annotation scale (CANNOSCALE), shown on the status bar as in S17, with a list from VP_SCALES (src/model/planViewports.ts) plus custom.
2. An annotative flag on text style, dim style, mleader style, table style, hatch, and block def. Annotative items store paper height (mm) and the list of scales they support (scales?: string[]). Shown size = paper height × scale. In a viewport, an annotative item shows only if it supports that viewport's scale (unless "show all").
3. Commands: ANNOSCALE / CANNOSCALE (set), OBJECTSCALE (add or remove scales on picked items), ANNOAUTOSCALE toggle (adds the current scale to all annotative items when it changes).
4. Pure helpers + tests: the effective height for a scale, viewport visibility filter, autoscale add.
5. DXF/DWG: write each annotative item once at the model scale of the current CANNOSCALE (full annotative scale contexts are optional. Say which in the PR). Print uses each viewport's scale.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-annotative-scale origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S17. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

---

# Phase 3 — Geometry & editing depth

## Step 18 — SPLINE and SPLINEDIT (P2)
Branch: `feat/cad-spline` · Spec: S18

Flexible conduit and free-form routes. The reader already draws the architect's splines; now you can draw your own.

```text
Feature: SPLINE and SPLINEDIT (spec S18).

Build:
1. A SketchItem kind 'spline': degree (3), fit points or control vertices + knots + optional weights, closed. Store fit points when drawn by Fit and compute CVs. src/model/cadSpline.ts (pure): fit-point interpolation (chord-length parameterisation), de Boor evaluation (port the logic of spline_points in engines/cad-reader/src/doc.rs to TS, or call the WASM engine if it exposes it), tessellation to a tolerance in screen pixels, length, nearest point, and tangent.
2. Commands: SPL / SPLINE (Method Fit / CV, Close, Undo), SPE / SPLINEDIT (Close/Open, Fit data: add/delete point, convert to Polyline with a precision). Grips on fit points or CVs.
3. Integrate with the path tools where sensible: OFFSET (approximated → polyline result, say so), TRIM/EXTEND as cutting edges, DIVIDE/MEASURE, length in properties. A cable route on a spline counts its spline length.
4. DXF/DWG as SPLINE (codes 70/71/72/73/74, 10/11). Round-trip test against an engine fixture.
5. Tests: interpolation passes through fit points, length of a known curve within 0.1 %, and the CV/fit switch.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-spline origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S18. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 19 — PEDIT and LENGTHEN (P2)
Branch: `feat/cad-pedit-lengthen` · Spec: S19

Edit polylines (vertices, width, arcs, joining lines) and change a route to an exact length.

```text
Feature: PEDIT, LENGTHEN and REVERSE (spec S19).

Build:
1. Polyline arcs: pline vertices may carry bulge?: number[] (the DXF bulge per segment) and widths ([start,end][]). Update segmentsOf/pathOf/length/snap/offset/trim in cadSketch.ts and cadEdit.ts for bulges (arc segments). This is the core of the PR, so test it hard.
2. PE / PEDIT: Close/Open, Join (lines/arcs/plines end to end → one pline; "Multiple" + fuzz distance), Width (whole), Edit vertex (Insert, Move, Delete, Straighten, Width), Fit/Spline/Decurve (Spline → a 'spline' item from step 18), Reverse, Undo inside the command. Picking a line or arc offers "Convert to polyline? <Y>".
3. LEN / LENGTHEN: DElta, Percent, Total, DYnamic, on lines, arcs, plines (last/first segment) and cable routes (length shown in metres via cadLengths.ts).
4. REVERSE command. Keep trays' and cable routes' metadata through every edit.
5. DXF/DWG: LWPOLYLINE with bulges (42) and widths (40/41). Round-trip test.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-pedit-lengthen origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S19. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 20 — BOUNDARY, REGION and associative hatch (P2)
Branch: `feat/cad-boundary-assoc-hatch` · Spec: S20 (+ Hatch editing proposal)

Pick inside an area to get its outline. Hatches follow their boundary when you edit it.

```text
Feature: BOUNDARY, REGION and associative hatch (spec S20). First read
"UI UX proposals - 2026-11-08 - Hatch editing and pattern library.md" and do only its association and HATCHEDIT parts
here (the pattern library is a separate PR).

Build:
1. Expose src/model/cadBoundary.ts (today used for rooms) as a general BOUNDARY / BO command: click inside → a closed drawn pline (and inner loops as separate plines if island detection is on), from both drawn lines and the architect's visible layers. REG / REGION: the closed pline(s) as a region item (stored as loops; drawn as outlines; area in properties).
2. Associative hatch: a hatch remembers its boundary item IDs (boundaryIds?: string[]). Edits to those items (move, stretch, grips, PEDIT) recompute the hatch loops. If a boundary is erased or can't close, the hatch loses association (message).
3. HE / HATCHEDIT and double-click a hatch: pattern, scale, angle, origin, associative on/off.
4. Tests: boundary from a T-junction plan, islands, association surviving stretch, breaking on erase.
5. DXF/DWG: HATCH with 97/330 source boundary handles when associative. Round-trip test.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-boundary-assoc-hatch origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S20. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 21 — Associative dimensions + DIMEDIT (P2)
Branch: `feat/cad-assoc-dims` · Spec: S21

Dimensions update when you stretch or move what they measure.

```text
Feature: associative dimensions, DIMREASSOCIATE, DIMEDIT, DIMTEDIT (spec S21).

Build:
1. On a 'dim' item, each definition point may store assoc?: {id, snap:'endpoint'|'midpoint'|'center'|'quadrant'| 'intersection', index?} when it was placed with object snap on a drawn item. After any edit command (one place: the function that commits sketch changes), recompute the associated points from the referenced items and update the dims in the same undo step.
2. If the referenced item is erased or exploded, the dim keeps its last points and drops the association.
3. DRE / DIMREASSOCIATE (pick dim, then re-pick points), DIMDISASSOCIATE, DED / DIMEDIT (Home, New text, Rotate, Oblique), DIMTEDIT (Left, Right, Centre, Home, Angle).
4. The architect's geometry is not associative in this PR (it never changes). Note it.
5. Tests: move, stretch, rotate, grip edit of the measured line; erase drops the association; one undo step.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-assoc-dims origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S21. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 22 — Fence, lasso, previous selection and cycling (P2)
Branch: `feat/cad-selection-fence-lasso` · Spec: S22 (+ Selection proposal)

Faster picking on dense plans: fence through lines, lasso drag, P for the previous set, and cycling through overlaps.

```text
Feature: fence, lasso, previous selection and selection cycling (spec S22). First read
"UI UX proposals - 2026-11-08 - CAD selection shortcuts and tracking.md" and implement only the parts listed in S22.

Build:
1. src/model/cadEdit.ts (pure): sketchByFence(items, pts) (segments crossing the fence polyline) and sketchInLasso(items, polygon, crossing) (point-in-polygon + crossing test). Tests.
2. At any "Select objects:" prompt, accept F (fence), WP / CP (window/crossing polygon), P (previous), L (last), ALL, and R / A (remove/add mode). Click-and-drag with movement > 8 px that isn't a straight rectangle drag (or with a held modifier, per the proposal) = lasso.
3. Selection cycling: Shift+Space (or a click with overlapping hits, per the proposal) shows the small list menu (S22) of the hits under the cursor.
4. Keep the previous selection per drawing, updated after each command.
5. Tests for each mode in a "selection prompt" parser function.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-selection-fence-lasso origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S22. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

---

# Phase 4 — Advanced & references

## Step 23 — Image and PDF underlays (P2)
Branch: `feat/cad-image-pdf-underlay` · Spec: S23 (+ Underlays proposal)

Concept-stage jobs where the architect sends only a PDF or JPG: attach, scale by two points, clip, and fade.

```text
Feature: raster image and PDF underlays (spec S23). First read "UI UX proposals - 2026-11-08 - CAD underlays and
calibration.md". It is the spec for flow, options and defaults. Build that proposal.

Build notes:
1. Data model: per drawing, underlays: {id, kind:'image'|'pdf', file (name; the path is remembered locally like plans, cadState.ts rememberPath), page?, insert, scale, rot, clip?: polygon, fade, monochrome, printOnSheets, layer}.
2. PDF: render pages with pdf.js (check the existing PDF dependencies first; add pdfjs-dist within policy only if none exists, and note it in the PR). Vector snap is optional: if pdf.js operator lists are used, snap only to line ends, and keep it behind a flag.
3. Calibrate: two points + typed real distance → scale. Commands IMAGEATTACH / IAT, PDFATTACH, IMAGECLIP / PDFCLIP, ADJUST (fade/contrast/monochrome).
4. Print: off by default (per the proposal), monochrome. DXF/DWG: IMAGE + IMAGEDEF for raster, PDFUNDERLAY + PDFDEFINITION for PDF. Round-trip test with a small fixture.
5. Privacy: underlay files never copy into the project file. Check scripts/check-privacy.mjs still passes.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-image-pdf-underlay origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S23. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 24 — UCS and named views (P3)
Branch: `feat/cad-ucs-views` · Spec: S24

Draw along an angled wing of the building with ortho and grid following it, and jump back to saved views.

```text
Feature: 2D UCS and named views (spec S24).

Build:
1. Per drawing: the current UCS {origin, angle}, named UCSs, and a previous-UCS stack. Pure transforms in src/model/cadUcs.ts (wcsToUcs / ucsToWcs). Tests.
2. Typed coordinates (x,y and @dx,dy / @d<a in cadPrompt.ts), ORTHO, POLAR, GRID and SNAP all work in the UCS. Stored geometry stays in world coordinates. The properties palette shows world coordinates (with a "UCS" toggle).
3. UCS command options World / 3point / OBject (align to a picked line or pline segment) / Previous / Z (rotate), plus the UCS icon at bottom-left (S24). PLAN command turns the view to the UCS.
4. V / VIEW: named views (centre, scale, view rotation, UCS and layer state optional) with New / Set current / Delete. Saved per drawing in the project.
5. Tests: rotated ortho, typed polar in a rotated UCS, OBject alignment, a view restore.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-ucs-views origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S24. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 25 — Block editor (BEDIT) (P3)
Branch: `feat/cad-block-editor` · Spec: S25

Edit a block definition in place, and every insert updates. This is the base for dynamic blocks later.

```text
Feature: BEDIT block editor (spec S25). Needs steps 9–11.

Build:
1. BE / BEDIT (pick a block name or an insert; a double-click on an insert without attributes opens it too): switches the CAD canvas to an editing session for that def's items (a separate edit buffer; the drawing is hidden or faded behind it). A ribbon contextual group as in S25: Save block, Save as…, Attribute definition, Close editor (asks to save changes).
2. All draw/modify/annotate tools work inside. The base point is shown and movable (BASE).
3. Save: replaces the def; every insert shows it at once; attributes added get their defaults on existing inserts, and removed ones are dropped (warn first). One undo step for the whole save.
4. The architect's blocks can be opened read-only ("Save as…" copies them as a user block).
5. Tests: def replace + insert expansion, attribute sync on existing inserts, undo restores the old def. Defer dynamic blocks; add a note in docs/notes/Future development/.

--- Rules (from AGENTS.md) ---
• Read AGENTS.md and follow it. One topic only on this branch.
• Start: git fetch origin main && git checkout -b feat/cad-block-editor origin/main
• UI: the visible change is approved in "docs/notes/Future development/UI UX proposals - 2026-11-09 - Design CAD 2D gap plan.md" section S25. Build exactly that. Reuse existing components, CSS classes, icons (lucide-react) and wording style. Do not restyle or move anything else.
• Do not launch the app, take screenshots or use a browser. Verify only with: npm run typecheck && npm run lint && npm test
• Keep pure geometry in src/model (unit-tested beside it). Keep React in src/components/cad. Match the comment style.
• Any new SketchItem kind or field must work everywhere: canvas draw, snap points, grips, move/copy/rotate/scale/mirror, properties palette (cadProps.ts), MATCHPROP, erase, undo (one step per command), DXF/DWG save (CadSaveAs.tsx → engines/cad-reader writer), plan-sheet print and PDF. Add a DXF round-trip test.
• Register commands in src/components/cad/cadCommands.ts (aliases + desc), tools in cadState.ts (CadTool), and prompts in CadPage.tsx.
• Add an entry to src/model/whatsNew.ts and make sure HELP lists the new commands.
• If something in the spec is unclear or needs a decision, write it in docs/notes/Future development/ and stop. Don't guess.
• Commit, push, open a PR to main. Never merge.
• Report briefly: what changed, the files, and the test results.
```

## Step 26 — Release batch and manual refresh (P3)
Branch: `release/cad-2d-gap` · Spec: —

After each phase: bump the minor version, consolidate What's new, refresh the manual and check DWG round trips.

```text
Task: release batch for the Design CAD 2D work merged since the last release.

1. git fetch origin main && git checkout -b release/cad-2d-<phase> origin/main
2. Bump the minor version in package.json (per AGENTS.md).
3. In src/model/whatsNew.ts, group this phase's entries under the new version with an action to open Design CAD. Make sure HELP lists every new command and alias, with no duplicate aliases (add a test that fails on a duplicate alias in CAD_COMMANDS if there isn't one).
4. Run npm run manual:update (allowed by AGENTS.md: hidden window, demo project only), then npm run check:manual.
5. Add a DWG/DXF round-trip regression: a fixture drawing that uses every new kind (mtext, radius/diameter/angular dims, point, insert + attributes, mleader, table, wipeout, spline, pline with bulges) saved and reopened through the engine with identical counts.
6. npm run typecheck && npm run lint && npm test (and npm run test:pdf, because sheet printing changed).
7. Commit, push, open the PR "release: v2.xx Design CAD 2D drafting (phase N)". Do not merge.
```
