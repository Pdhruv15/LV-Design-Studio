/** The dialogs of Design CAD → Output that the app opens (Plot, Page setups, Printers, Batch plot), and Register,
 * which saves the sheet register at once. Pen tables, Preview, Publish and the PDF / DXF / DWG exports belong to the
 * open sheet. */
export type OutputDialog = 'plot' | 'setups' | 'printers' | 'pens' | 'batch' | 'register';
