const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    uploadMp3Files: () => ipcRenderer.invoke('upload-mp3-files'),
    deleteMp3File: (fileName) => ipcRenderer.invoke('delete-mp3-file', fileName), 
    loadAllMp3Files: () => ipcRenderer.invoke('load-all-mp3-files'),
    onSongsUpdated: (callback) => ipcRenderer.on('songs-updated', (event, fileName) => callback(fileName)),
    resizeWindow: (width, height) => ipcRenderer.send('resize-window', width, height),
});
