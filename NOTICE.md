# Notice

Copyright (c) 2026 Palanisami Govindasamy (https://github.com/Pdhruv15/LV-Design-Studio)

LV Design Studio is dual-licensed under either of

- the **MIT License** (`LICENSE-MIT`), or
- the **Apache License, Version 2.0** (`LICENSE-APACHE`),

at your option. You may use, copy, change, distribute, sublicense and sell it, including in commercial and closed-source products. Keep the copyright notice and the licence text with copies.

Unless you state otherwise, any contribution you submit for inclusion in LV Design Studio is dual-licensed as above, without any additional terms.

## Name and logo

Both licences cover the code, not the name **"LV Design Studio"** or its logo. Changed versions should use their own name and should not suggest they come from or are endorsed by the author.

## Third-party software

LV Design Studio is built with open-source libraries under their own licences (MIT, ISC, Apache-2.0 — for example React, Electron, ExcelJS, pdf-lib, docx, JSZip, Lucide icons, Vite, TypeScript). Their licence texts are included with them in `node_modules`. The installed app has no `node_modules`: the libraries are compiled into it, and their licence texts are in `third-party-licences.md` in its `dist` and `dist-electron` folders (inside `app.asar`), written by each build. Windows and Linux packages also have Electron's and Chromium's licence files next to the app. The Mac app has them inside it, in `Contents/Resources`, with the Chromium list gzipped.

The `lvds` command line tool, MCP server and local API (`src/headless`) also use the official Model Context Protocol TypeScript SDK (`@modelcontextprotocol/sdk`, MIT, Copyright (c) 2024 Anthropic, PBC), Zod (MIT, Copyright (c) 2025 Colin McDonnell) and xmldom (`@xmldom/xmldom`, MIT, Copyright 2019 - present Christopher J. Brody and contributors, 2012 - 2017 @jindw and contributors), with their own MIT / ISC / BSD-2-Clause dependencies. These licences are compatible with this app's MIT / Apache-2.0 licence; only their copyright notices must be kept, as above.

The built-in DWG / DXF reader (`engines/cad-reader`, compiled to WebAssembly in `electron/cad`) uses **acadrust** (https://github.com/hakanaktt/acadrust), Mozilla Public License 2.0, unmodified, with its own MIT / Apache-2.0 Rust dependencies (serde, serde_json, wasm-bindgen and others). MPL-2.0 applies file by file: the acadrust source files stay under MPL-2.0 and their source is available from its repository and crates.io; the rest of LV Design Studio keeps its own licence. Any change made to an acadrust file would be published under MPL-2.0.

## Standards

IEC, BS EN and other standard numbers, clause numbers and table numbers are used only to identify the method a calculation follows. LV Design Studio does not include text, figures or tables copied from IEC publications. It is not affiliated with or endorsed by the IEC or any other standards body. The app has its own drawings of the IEC 60617 symbols. The ambient temperature correction factors are calculated from the conductor temperature rise, not taken from a table. The other built-in derating and grouping factors are a few rounded design values. The table number next to each one lets you check it against the standard. Use the current edition of each standard, from the IEC or your national standards body, and the cable manufacturer's data for a real project.

## Authorities and manufacturers

The DEWA cable and breaker limits and the Dubai Municipality substation room form (DM-D-013) in the app are the author's own unofficial working of published authority requirements. They are not issued, checked or endorsed by DEWA or Dubai Municipality, and an output of the app is not an official authority form. Check every value against the authority's current edition before a submission.

Cable dimensions shown under a manufacturer's name (for example DUCAB) are taken from that manufacturer's published data, to help with tray and containment sizing. LV Design Studio is not affiliated with or endorsed by DUCAB or any other manufacturer; their names and trade marks belong to them. Use the manufacturer's current datasheet for a real project.

## Engineering disclaimer

Calculations are a design aid. Results must be checked by a qualified engineer against the applicable standards and authority (e.g. DEWA / DM) requirements before use.
