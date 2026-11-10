const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lvds', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    chooseProjectsFolder: () => ipcRenderer.invoke('settings:chooseProjectsFolder'),
    chooseDatabaseFolder: (reset) => ipcRenderer.invoke('settings:chooseDatabaseFolder', reset),
    choosePython: () => ipcRenderer.invoke('settings:choosePython')
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    load: (file) => ipcRenderer.invoke('projects:load', file),
    read: (file) => ipcRenderer.invoke('projects:read', file),
    stat: (file) => ipcRenderer.invoke('projects:stat', file),
    save: (file, data, expected, force) => ipcRenderer.invoke('projects:save', { file, data, expected, force }),
    delete: (file) => ipcRenderer.invoke('projects:delete', file),
    trashList: () => ipcRenderer.invoke('projects:trashList'),
    restore: (trashFile) => ipcRenderer.invoke('projects:restore', trashFile),
    emptyTrash: () => ipcRenderer.invoke('projects:emptyTrash'),
    pick: () => ipcRenderer.invoke('projects:pick')
  },
  recovery: {
    write: (r) => ipcRenderer.invoke('recovery:write', r),
    read: () => ipcRenderer.invoke('recovery:read'),
    readAll: () => ipcRenderer.invoke('recovery:readAll'),
    clear: (id) => ipcRenderer.invoke('recovery:clear', id)
  },
  log: {
    error: (text) => ipcRenderer.invoke('log:error', text)
  },
  database: {
    init: (seeds) => ipcRenderer.invoke('database:init', seeds),
    read: () => ipcRenderer.invoke('database:read'),
    open: (file) => ipcRenderer.invoke('database:open', file),
    write: (bookId, rows) => ipcRenderer.invoke('database:write', bookId, rows),
    readLibrary: () => ipcRenderer.invoke('database:library:read'),
    writeLibrary: (data) => ipcRenderer.invoke('database:library:write', data),
    onChange: (cb) => {
      const listener = (_evt, data) => cb(data);
      ipcRenderer.on('database:changed', listener);
      return () => ipcRenderer.removeListener('database:changed', listener);
    }
  },
  folderTemplates: {
    list: () => ipcRenderer.invoke('folderTemplates:list'),
    save: (template) => ipcRenderer.invoke('folderTemplates:save', template),
    delete: (id) => ipcRenderer.invoke('folderTemplates:delete', id),
    setDefault: (id) => ipcRenderer.invoke('folderTemplates:setDefault', id),
    import: () => ipcRenderer.invoke('folderTemplates:import'),
    export: (templates, defaultName) => ipcRenderer.invoke('folderTemplates:export', { templates, defaultName })
  },
  engines: {
    probe: () => ipcRenderer.invoke('engines:probe'),
    run: (request) => ipcRenderer.invoke('engines:run', request)
  },
  cadFile: {
    takePending: () => ipcRenderer.invoke('cad:takePending'),
    engine: () => ipcRenderer.invoke('cad:engine'),
    openBytes: () => ipcRenderer.invoke('cad:openBytes'),
    readBytes: (file) => ipcRenderer.invoke('cad:readBytes', file),
    stat: (file) => ipcRenderer.invoke('cad:stat', file),
    sampleBytes: (name) => ipcRenderer.invoke('cad:sampleBytes', name),
    chooseBlockFolder: () => ipcRenderer.invoke('cad:chooseBlockFolder'),
    listFolder: (folder) => ipcRenderer.invoke('cad:listFolder', folder),
    onPending: (cb) => {
      const listener = () => cb();
      ipcRenderer.on('cad:pending', listener);
      return () => ipcRenderer.removeListener('cad:pending', listener);
    }
  },
  files: {
    saveText: (opts) => ipcRenderer.invoke('files:saveText', opts),
    saveBinary: (opts) => ipcRenderer.invoke('files:saveBinary', opts),
    overwriteBinary: (opts) => ipcRenderer.invoke('files:overwriteBinary', opts),
    savePdf: (opts) => ipcRenderer.invoke('files:savePdf', opts),
    pdfBytes: (opts) => ipcRenderer.invoke('files:pdfBytes', opts),
    printers: () => ipcRenderer.invoke('files:printers'),
    printHtml: (opts) => ipcRenderer.invoke('files:printHtml', opts)
  }
});
