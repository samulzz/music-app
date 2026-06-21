const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nation', {
  getSession: () => ipcRenderer.invoke('session:get'),
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  register: (credentials) => ipcRenderer.invoke('auth:register', credentials),
  logout: () => ipcRenderer.invoke('auth:logout'),
  search: (query) => ipcRenderer.invoke('music:search', query),
  download: (song) => ipcRenderer.invoke('music:download', song),
  getLibrary: () => ipcRenderer.invoke('library:list'),
  removeLocal: (sourceId) => ipcRenderer.invoke('library:remove-local', sourceId),
  getPlaylists: () => ipcRenderer.invoke('playlists:list'),
  getPlaylistSongs: (id) => ipcRenderer.invoke('playlists:songs', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  chooseMusicDirectory: () => ipcRenderer.invoke('settings:choose-directory'),
  openMusicDirectory: () => ipcRenderer.invoke('app:open-folder'),
  onDownloadProgress: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on('download:progress', wrapped);
    return () => ipcRenderer.removeListener('download:progress', wrapped);
  },
});
