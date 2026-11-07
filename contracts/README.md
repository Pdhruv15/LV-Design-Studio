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

Export it with the headless tool `export_design_package` (preview first; exporting needs the approving engineer's name).
