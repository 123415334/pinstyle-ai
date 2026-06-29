const { contextBridge, ipcRenderer } = require('electron');

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

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
  openPinterestAuthWindow(url) {
    return ipcRenderer.invoke('auth:pinterest-window', url);
  },
  getPlatform() {
    return {
      platform: process.platform,
      isMac,
      isWindows,
      systemName: isMac ? 'Mac' : isWindows ? 'Windows' : 'desktop',
    };
  },
});
