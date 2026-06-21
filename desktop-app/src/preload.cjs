const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nation', {
  getSession: () => ipcRenderer.invoke('session:get'),
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  register: (credentials) => ipcRenderer.invoke('auth:register', credentials),
  logout: () => ipcRenderer.invoke('auth:logout'),
  search: (query) => ipcRenderer.invoke('music:search', query),
  prepareStream: (song) => ipcRenderer.invoke('music:prepare-stream', song),
  getLibrary: () => ipcRenderer.invoke('library:list'),
  saveToLibrary: (song) => ipcRenderer.invoke('library:save', song),
  removeFromLibrary: (serverId) => ipcRenderer.invoke('library:remove', serverId),
  getPlaylists: () => ipcRenderer.invoke('playlists:list'),
  getPlaylistSongs: (id) => ipcRenderer.invoke('playlists:songs', id),
});
