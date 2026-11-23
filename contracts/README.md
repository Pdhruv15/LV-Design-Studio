# Exchange contracts

JSON Schema files for the packages LV Design Studio exchanges with other programs (contract `lvds.exchange`, version 1):

| File | Package |
| --- | --- |
| `exchange-package.schema.json` | Any package (one of the three below) |
| `rooms.schema.json` | Room schedule from CAD / IFC, or LV rooms for ELV design |
| `fixtures.schema.json` | Luminaire schedule (lighting design program) |
| `loads.schema.json` | ELV upstream AC loads |

They are generated from `src/exchange/contracts.ts`; do not edit them by hand. After changing a contract:

```bash
UPDATE_CONTRACTS=1 npx vitest run src/exchange/contracts.test.ts
```

Rules: SI units (m², W, kW, V); every package names its source program and file; `sha256` (optional) is the SHA-256 of
the package without that field, keys sorted at every depth. A package is a proposal until the engineer accepts it.
Examples: `tests/fixtures/exchange/`.

## Design data (`lvds.design`, version 1)

`design.schema.json`: the electrical design as one file for BIM add-ins, scripts and AI clients. It holds boards,
circuits (breaker, cable, length, load) and ELV devices, with the results of a calculation made at export time. Every
board and circuit has a permanent `uid` and its `tag` (the name shown in the app). Key on `uid`, because tags change on
rename. The app only writes this file; it never reads it back. `sha256` covers the package without `sha256` and
`exportedAt`, so the same design always gives the same hash. Made from `src/exchange/designContract.ts`:

```bash
UPDATE_CONTRACTS=1 npx vitest run src/exchange/designExport.test.ts
```

`status.faultAssumed` (optional, `true`): the board's source has no transformer data or supply fault level, so the
fault level is a placeholder. `status.icu` is then the plain comparison with that placeholder, not a verified check
(the circuit's `overall` is at least `warn`).

Export it with the headless tool `export_design_package` (preview first; exporting needs the approving engineer's name).

## Native drawing file (`lvds.plan`, version 1)

`Name.lvplan` sits beside the project file `Name.lvds` and holds what is drawn in Design CAD: drawn objects, the
drawing's own blocks, erased architect objects, layouts, references, layer settings, units and the drawing styles.
Devices, wiring, cable routes and what blocks and layers mean electrically stay in the project file, because the
calculations read them. Made from `src/model/planPackage.ts`:

```bash
UPDATE_CONTRACTS=1 npx vitest run src/model/planPackage.test.ts
```

The file is a zip:

```
manifest.json            plan.schema.json: format, version, the drawings of the project and of each issued revision
drawings/<sha256>.json   plan-drawing.schema.json: one drawing file's part, with the project fields of that drawing
shared/<sha256>.json     the drawing settings that belong to no single drawing (text, dimension and point styles…)
```

- Each part is named by the SHA-256 of its JSON text. A drawing that did not change between issued revisions is
  stored once, and the same drawn work always gives the same file.
- `manifest.live.drawings` names each drawing's file, so a reader finds a plan without opening every part.
  `order` lists, per project field, which drawings hold it, in the project's order.
- A reader refuses a newer `version` and a package whose revisions do not match the project file's.
- The project file links to it as `"plan": { "file": "Name.lvplan", "sha256": "…", "version": 1 }`, the SHA-256 of the
  whole .lvplan file. The app writes the .lvplan first and keeps the one before as `Name.lvplan.bak`, so a reader
  takes whichever of the two has that SHA-256. If neither does, the drawn work is missing: the app opens the project
  without it, read-only, and writes nothing over it.
- Points are drawing units, as in the drawing. Each object keeps its `id`, `kind`, `layer` and `pts`; other keys
  are as the app writes them, so a reader keeps what it does not know.
