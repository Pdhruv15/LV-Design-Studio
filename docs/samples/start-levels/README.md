# Sample projects, one for each SLD start level

Eight small projects, each started the way the New project wizard starts it. Every one has circuits sized by the app, so the calculations run without a careless failure.

| File | Starts from | What to look at |
|---|---|---|
| `01-final-db.lvds` | A final DB fed from a board outside the project | The Supply tab with fault level, X/R, voltage drop used upstream, Ze, allowed load and the incoming cable typed; six final circuits and a spare |
| `02-sub-main-board.lvds` | A sub-main board fed from outside | The same given values on an SMDB; two DBs below it and a lift feeder |
| `03-main-board-lv-source.lvds` | A main board on an LV source ("Source") | A given fault level of 25 kA at the busbar; one sub-main board and two DBs |
| `04-transformer-main-board.lvds` | A transformer and main board (the default) | Fault level from the 1000 kVA transformer; sub-main board and DBs |
| `05-rmu-one-transformer.lvds` | An RMU feeding one transformer | The MV supply and RMUs card; a small tree below the main board |
| `06-rmu-two-transformers.lvds` | An RMU feeding two transformers | Two main boards and the bus coupler BC-1 (normally open) |
| `07-ring-two-substations.lvds` | An 11 kV ring with two substations | The grid source, two RMUs and two transformers |
| `08-generator-and-solar.lvds` | Two first boards on LV sources | A 250 kVA generator (calculated fault level 2.43 kA) and a 100 kVA solar source (0.17 kA). Earth-fault disconnection on the generator board reads "not verified" until a minimum fault level is typed on its Supply tab. The solar board has two small circuits only, because its fault current is low |

## Open one

File → Open, choose a `.lvds` file from this folder. Use Save as under a new name straight away, so the sample stays unchanged.

## Make the files again

The files are written by `src/model/startSamples.ts`, and a test fails when they no longer match it (after a change to the builder or to the project model). To write them again:

```
npm run samples:start-levels
```
