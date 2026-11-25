# Neutral source wording: open points (2026-11-25)

Default texts that named one authority were neutralised in v2.290. These items still name an authority, because changing them changes behaviour or a stored value. Each needs a decision.

| # | What | Where | Options | Recommended |
|---|------|-------|---------|-------------|
| 1 | New projects start with point template `dewa-villa`; sample project too | `src/types.ts:124`, `src/data/sampleProject.ts:15` | (a) keep, shown as "villa submission form"; (b) add a neutral template id and keep the old one as an alias | (b) |
| 2 | Brief and setup template default the approving authority to "DEWA" and print "DEWA submission package" | `src/model/brief.ts:87`, `src/model/setupTemplate.ts:21` | (a) blank authority; (b) "Authority" | (a), deliverable title "Authority submission package" when blank |
| 3 | SLD style chip is labelled "DEWA" and its tooltip says "DEWA wording"; stored value `sldStyle: 'dewa'` | `src/components/SystemDiagram.tsx:1350`, `src/components/docs/DrawingsView.tsx:333` | (a) rename label to "Submission style", keep stored value; (b) keep | (a) |
| 4 | Transformer size list defaults to `'dewa'`; labels "DEWA transformers", "DEWA 11 / 0.415 kV", "DEWA size needed" | `src/calc/txGen.ts:38`, `src/calc/spacePlan.ts:34`, `src/components/TransformersTab.tsx:61,81,102` | (a) default to the market standard list; (b) label from the chosen list name | (b), default change needs sign-off |
| 5 | Headless tools and export catalogue name the forms "DEWA forms" / "DEWA load forms" (also in file names) | `src/headless/exportTools.ts:169,182,204,217`, `src/components/docs/exportCatalogue.ts:141,158,159` | (a) keep, the forms are that authority's format; (b) "Authority load forms" with a file-name change | (a) until another authority format exists |
| 6 | Folder roles and templates: "DEWA submissions" folder, `authDewa` | `src/model/folderRoles.ts:33`, `src/model/folderTemplateBuiltins.ts:182` | (a) keep; (b) free-named "Authority submissions" role, `authDewa` as alias | (b) |
| 7 | Compliance row "Cable / breaker limits (DEWA Appendix 5)" | `src/docs/compliance.ts:106` | read the name of the applied rule set | do it with item 4 |
| 8 | User guide task "DEWA forms (MD, TCL summary, bus riser)" | `src/help/guide.ts:30` | rename with item 5 | follow item 5 |
