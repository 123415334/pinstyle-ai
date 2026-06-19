const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tackDesktop', {
  openExternal(url) {
    return ipcRenderer.invoke('open-external', url);
  },
  getSession() {
    return ipcRenderer.invoke('auth:get-session');
  },
  setSession(session) {
    return ipcRenderer.invoke('auth:set-session', session);
  },
  clearSession() {
    return ipcRenderer.invoke('auth:clear-session');
  },
  signInWithGoogle(mode) {
    return ipcRenderer.invoke('auth:google', mode);
  },
});
