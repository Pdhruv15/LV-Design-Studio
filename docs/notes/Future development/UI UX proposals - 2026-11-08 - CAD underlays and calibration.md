# UI / UX proposal — CAD underlays and scale calibration (2026-11-08)

Status: **awaiting renewed user approval; not implemented.** Mockup: [cad-underlays-calibration-mockup.html](../../mockups/cad-underlays-calibration-mockup.html).

This proposal deliberately revisits an earlier decision. PDF / image underlays were declined on 2026-11-06 ("opening PDF in our software is not required"). No underlay UI, file reader or project model should be built until the user explicitly approves this proposal and reverses that decision.

## Outcome

An engineer can use a PDF or raster plan as a local external underlay in 2D Design CAD, including when no DWG/DXF exists:

- explicitly choose a PDF, PNG, JPEG, WebP, BMP or TIFF from this computer;
- choose one PDF page (the same PDF may be attached again for another page);
- place the page/image by insertion point, rotation and uniform scale;
- calibrate it by picking two points and entering their known real length;
- clip it to a rectangle or picked outline, fade it and show it in monochrome;
- trace rooms, routes and design work over it without copying the source into the project;
- snap only to verified vector PDF path geometry, never to pixels, OCR guesses or uncertain PDF content; and
- optionally print it below the design in grayscale only. Reports and sheets never gain colour.

The source remains a local external reference. The project stores its file name, media kind, PDF page and placement settings, but not its absolute path or bytes.

## What exists now

- `src/model/cadRefs.ts` already provides a per-plan external-reference model, insertion/rotation/scale transforms, polygon clipping, fade/print settings, status, sheet loading and a snap index for trusted line geometry.
- `src/components/cad/CadRefs.tsx` and `refFiles.ts` provide the References manager, attach/repath/reload/unload/detach actions and local-path recovery for DWG/DXF references.
- `src/model/cadUnits.ts` gives the host plan's metres per drawing unit. It currently supports a discrete unit choice, not an arbitrary calibration factor.
- The Rust/WASM reader and Electron `cadFile` bridge accept only DWG/DXF. They must not be made to treat PDF or image bytes as drawings.
- `pdfjs-dist` is presently a test-only dependency used by PDF visual tests. Production PDF page rendering and any vector-path inspection need a separately reviewed, bundled, offline runtime path.

## Proposed screen workflow

### 1. Entry points

Keep one external-reference home instead of adding a second manager:

- **References (XR)** keeps its current ribbon place. Its **Attach…** menu gains **Drawing reference** and **PDF / image underlay**.
- Typed command **UA** (`UNDERLAYATTACH`) starts the underlay flow. **UC** (`UNDERLAYCALIBRATE`) recalibrates the selected underlay.
- If a level has no plan, **Plans → New plan from PDF / image…** creates an empty 2D model space for that level and attaches the chosen underlay. This is required for PDF-only projects; it does not create a DWG/DXF or copy the source.

No existing ribbon group, button or workflow moves.

### 2. Choose source and PDF page

The desktop file dialog is the only way to grant a new source. It filters to PDF and supported raster formats. After a PDF is chosen, a page chooser shows page number, page label where available, orientation and a small offline thumbnail. It opens on page 1; Enter accepts the selected page, double-click accepts it, and Escape returns without attaching anything.

Raster images skip page selection. Animated images use the first frame and say so. Multi-page TIFF is out of the first build unless explicitly approved.

### 3. Place

The Attach underlay form shows:

- source file and, for PDF, page number;
- name (unique on this plan);
- insertion point: `0, 0`, typed X/Y or **Pick on plan**;
- rotation: typed degrees or **Pick angle**;
- scale: typed uniform factor or **Calibrate after placement**;
- fade `0–90 %`, default `60 %`;
- **Monochrome**, on by default; and
- **Print on plan sheets**, off by default.

An uncalibrated underlay can be placed for orientation, but the References manager and command line show **Uncalibrated**. Measurements taken from it are not represented as reliable, and PDF vector snaps remain off until it is calibrated.

Place, rotate, scale, calibrate, clip, repath, reload, unload and detach are each one undoable project change where they change project state. Picking can be cancelled without an undo entry.

### 4. Calibrate with two points

**Calibrate** (or UC) uses a short command sequence:

1. Pick the first source point.
2. Pick the second source point.
3. Enter the known real length and unit, for example `5 m`, `4200 mm` or `12 ft`.
4. A confirmation line shows the picked image/PDF distance, resulting uniform scale and the measured real length. Enter accepts; Escape cancels.

The first picked point is the anchor: it stays at the same plan coordinate while the scale changes. Rotation and insertion are not silently changed. Calibration stores both source-space points, the known length in metres and the resulting source-to-plan scale so it can be explained and checked later.

Validation:

- both points must be finite and distinct by at least eight source pixels/page points;
- the real length must be finite and greater than zero;
- the unit must be one supported by Design CAD (`mm`, `cm`, `m`, `in`, `ft`);
- a result outside a generous engineering range is shown for confirmation rather than silently clamped; and
- changing the host plan's unit interpretation marks the calibration **Verify** until recalibrated or explicitly confirmed.

An invalid value keeps the command at step 3 with a specific error. Backspace edits typed input. Escape goes back one active pick where possible, then cancels. Enter accepts the current typed value or the highlighted confirmation. The existing F3 snap setting applies to host drawing geometry; underlay snapping follows the separate safety rule below.

### 5. Clip, fade and monochrome

Clip follows the existing Xref behavior: a rectangle or a picked closed outline in host-plan coordinates. **Remove clip** restores the whole page/image. Inverted clip is deferred.

Fade and monochrome affect display without changing source bytes. Monochrome uses luminance, keeps transparency, and applies fade afterwards. Turning monochrome off is screen-only when colour is useful for reading a marked-up source; printing remains grayscale.

### 6. PDF vector snapping — fail closed

- Raster images and scanned/raster-only PDF pages never supply snaps.
- No OCR, line detection or pixel-edge guessing is used.
- A PDF page may supply endpoint, midpoint and intersection snaps only after its vector stroke paths have been parsed with page rotation, transform stack and clipping applied, and the geometry extraction completed without a geometry-affecting unsupported operation or parse error.
- Text outlines, fills, images, masks, gradients and invisible paths do not supply snaps.
- When the safety gate fails, the whole page says **Snaps unavailable** and behaves as a raster underlay; display and calibration still work.
- Reloading or repathing disables snaps until the page has passed the gate again. Uncalibrated geometry does not snap.

The References manager shows **Vector snaps on**, **Raster — no snaps** or **Snaps unavailable**; it never suggests that a scanned line is exact.

### 7. Status, validation and errors

| State | Display and action |
|---|---|
| Loading | Progress indicator; Cancel stops decoding and leaves the project unchanged. |
| Uncalibrated | Visible with a warning; Calibrate is the primary action; no underlay snaps. |
| Loaded | Page/image shown using the saved transform. |
| Changed — reload | Existing content stays visible; Reload is explicit, never automatic. |
| Verify calibration | Source or host units changed; snaps stay off until confirmed or recalibrated. |
| Unloaded | Settings remain; no media memory is retained. |
| Not found | Placement, page and calibration remain; Repath opens an explicit file dialog. |
| Page unavailable | The PDF has fewer pages after reload/repath; choose another page or another source. |
| Unsupported / too large / damaged | Nothing is attached; the error names the rejected format, size or decode problem. |

Recommended safety limits for the first build are 200 MB per source and 250 megapixels per decoded raster page, with PDF pages rendered in viewport tiles rather than as one permanent full-resolution bitmap. Limits and errors must be tested before release; no network fallback or online conversion is allowed.

### 8. When the source moves or changes

The desktop main process keeps the previously granted absolute path in local app settings under an opaque source ID. The project contains only that ID, base file name and reference settings; exported project JSON does not disclose the path.

On reopen, only a path previously granted through the file dialog may be read. A renderer-supplied arbitrary path is not accepted. **Repath…** always opens the file dialog, validates the chosen type, records a new grant and checks the saved PDF page.

Each source keeps a local fingerprint (size, modification time, page/image dimensions and a content digest). If bytes change, the app shows **Changed — reload**. Reload keeps insertion, rotation, clip, fade and print settings. Calibration becomes **Verify**; if page/image dimensions changed it becomes invalid and must be redone. Repath to a different fingerprint asks for confirmation before retaining placement settings.

Detach removes the project reference and its local path grant when no other underlay uses it. It never deletes or edits the source file.

### 9. Plan sheets and saved drawings

- Underlays do not print by default.
- If enabled, a sheet reloads the explicitly granted source, applies page, placement, clip, monochrome and fade, and draws it below host-plan/reference linework. Output is grayscale/black-only regardless of the screen setting.
- A missing or unverified source is named in sheet notes rather than silently omitted.
- The existing report and title-block formats do not change.
- Save DXF/DWG does not embed raster/PDF underlays in the first build. The save result warns that external underlays were omitted; Bind remains only for drawing references.

## Proposed implementation boundary after approval

1. Add a separate `CadUnderlay` model keyed by host plan, while sharing the existing reference transform, clip, status and local-path concepts. Do not widen `CadRef` into an ambiguous drawing/media union.
2. Add a project-owned blank 2D host for a level whose only plan is an underlay. Drawing and measurement coordinates remain normal model-space coordinates.
3. Add narrowly validated Electron IPC for explicit source selection, granted-source reread/stat and PDF/image metadata. Keep source paths out of project data and logs.
4. Bundle PDF rendering locally and decode media off the React render path. Derived page images and snap geometry stay in memory and are released on unload/close.
5. Draw underlays beneath drawing references and host geometry. Reuse the current transform and clipping maths where coordinate types match.
6. Extend sheet rendering only after a black-and-white output mockup is separately approved if this proposal's sheet example is not sufficient.

No automatic plan extraction, OCR, room recognition, image tracing, 3D, elevation, image editing or source-file write is in scope.

## Verification required for the implementation PR

- Model tests: attach/update/detach, unique names, transform order, anchored calibration maths, unit conversions, clip, source-change transitions and migration/round-trip.
- Electron tests: extension and size validation, explicit-grant enforcement, no arbitrary path read, moved/missing files, page bounds and damaged input.
- Media fixtures: one vector PDF, one scanned PDF, rotated/cropped PDF pages, transparent PNG, large JPEG and supported TIFF/BMP variants.
- Snap tests: vector-only eligibility, transformed/rotated/clipped points, fail-closed unsupported operators, and no raster/OCR snaps.
- Canvas tests: layer order, fade/monochrome flags, unloaded/missing states and memory release.
- Sheet tests and `npm run test:pdf`: grayscale-only output, clip/placement, missing-source note and no colour operators from the underlay path.
- Full verification: `npm run typecheck && npm run lint && npm test`.

## Decisions needed from the user

Recommended answers are in bold.

1. Reverse the 2026-11-06 decision and build PDF/image underlays now: **yes** / no.
2. Keep underlays in the existing References manager and Attach menu: **yes** / give underlays a separate manager.
3. Allow **New plan from PDF / image…** to create an empty 2D host for PDF-only levels: **yes** / require a DWG/DXF host.
4. Calibration: keep the first point anchored, allow placement while uncalibrated but disable underlay snaps and mark it clearly: **yes** / require calibration before placement.
5. Snapping: **verified vector PDF paths only, fail closed; never raster/OCR snaps** / no underlay snapping in the first build.
6. Display/output: **monochrome on and 60 % fade by default; print off by default; printing always grayscale** / choose other defaults.
7. Raster formats: **PNG, JPEG, WebP, BMP and single-page TIFF in the first build** / omit TIFF initially.
8. Source changes: **manual reload and calibration verification** / reload automatically.
