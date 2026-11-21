const fs = require('node:fs');
const path = require('node:path');

/** Drawing files for the built-in DWG / DXF engine (acadrust compiled to WebAssembly, electron/cad; rebuilt with
 * `npm run build:cad`): the main process checks and reads the files, and the window's engine reads the drawings. */

const CAD_DIR = path.join(__dirname, 'cad');
const MAX_BYTES = 100 * 1024 * 1024;

/** A drawing file's bytes for the CAD view (read in the window by the engine), after checking its type and size.
 * `templates`: a drawing template (DWT, a DWG by another name) is taken too. */
function readDrawingBytes(file, templates = false) {
  if (!(templates ? /\.(dwg|dxf|dwt)$/i : /\.(dwg|dxf)$/i).test(file)) throw new Error(`${path.basename(file)} is not a ${templates ? 'DWG, DXF or DWT' : 'DWG or DXF'} file.`);
  const size = fs.statSync(file).size;
  if (!size) throw new Error(`${path.basename(file)} is empty.`);
  if (size > MAX_BYTES) throw new Error(`${path.basename(file)} is larger than ${MAX_BYTES / 1024 / 1024} MB.`);
  return new Uint8Array(fs.readFileSync(file));
}

/** The DWG / DXF files of a folder (the Blocks palette's library), by name; at most 500. */
function listDrawingFolder(folder) {
  const names = fs.readdirSync(folder, { withFileTypes: true }).filter((d) => d.isFile() && /\.(dwg|dxf)$/i.test(d.name)).map((d) => d.name).sort((a, b) => a.localeCompare(b)).slice(0, 500);
  return { folder, files: names.map((file) => ({ file, path: path.join(folder, file) })) };
}

/** The engine itself (WebAssembly), for the CAD view in the window. */
const engineBytes = () => new Uint8Array(fs.readFileSync(path.join(CAD_DIR, 'lvds_cad_reader_bg.wasm')));

module.exports = { readDrawingBytes, listDrawingFolder, engineBytes, MAX_BYTES };
