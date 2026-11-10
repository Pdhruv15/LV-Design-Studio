# UI UX proposal – Drafting ribbon full width (2026-11-10)

Status: **proposal, awaiting approval**. Nothing in `src/` changes until approved.

Mockup: `docs/mockups/cad-drafting-ribbon-full-mockup.html` (image: `cad-drafting-ribbon-full-mockup.png`).

## Today

Design CAD → Drafting shows Draw, Modify, Annotate, Layers, Properties and Measure. On a 1912 px window they end at about half the width; the right half is empty. Many small tools are icon-only, and several commands exist only as typed commands (`src/components/cad/cadCommands.ts`).

## Proposed

Same groups, same order, same Graphite look. Every tool gets a label, and existing typed-only commands get buttons. No new commands.

| Group | Change |
|---|---|
| Draw | Hatch becomes a large button; Rectangle, Polygon (POL, new button), Ellipse labelled. |
| Modify | All 16 edit tools in three labelled rows. New buttons: Extend (EX), Chamfer (CHA), Break (BR), Join (J). |
| Annotate | Room tag, North arrow, Revision cloud labelled. New buttons: Keynote (KN), Text style (ST), Dim style (D). Text ▾ menu lists Numbered text (TCOUNT) and the text tools: Justify (TJ), Height (TH), Align or space (TA), Case (TC), Frame (TFRAME), Mask (TMASK), Copy words (TCOPY). |
| Layers | Same controls; the small icons get names (Off, All on, Freeze, Thaw all, Lock, Unlock, Isolate, Unisolate, Make current). Unlock (LAYULK) is a new button. |
| Properties | Unchanged. |
| Measure and view | Replaces the Measure menu: Distance (DI), Area (AREA), Room area (RA), Inspect (LIST), Zoom extents (FIT), Select (SEL). |

Measured in the mockup: the groups take 1909 px of the 1910 px ribbon.

## What stays the same

- Tab and group order, colours, button sizes, tooltips and typed commands.
- Draw tab tests keep the same group names except Measure → "Measure and view".

## For the user to decide

1. Labels on every small button (as shown), or only on the new ones?
2. Text tools in the Text ▾ menu (as shown), or as their own group (needs about 240 px more, so a narrower Layers group)?
3. Keep "Measure and view" as one group, or a separate View group?
4. On narrower windows, which groups lose their labels first? Suggested: Layers, then Modify.
