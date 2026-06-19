const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, shell, ipcMain, safeStorage } = require('electron');

const SUPABASE_URL = 'https://sbdowcielgtcfholfyry.supabase.co';

let mainWindow;

function sessionPath() {
  return path.join(app.getPath('userData'), 'tack-session.json');
}

async function readStoredSession() {
  try {
    const raw = JSON.parse(await fs.readFile(sessionPath(), 'utf8'));
    if (raw?.encrypted && raw?.data && safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(Buffer.from(raw.data, 'base64'));
      return JSON.parse(decrypted);
    }
    return raw?.encrypted ? null : raw;
  } catch {
    return null;
  }
}

async function writeStoredSession(session) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  let payload = session || {};
  if (safeStorage.isEncryptionAvailable()) {
    payload = {
      encrypted: true,
      data: safeStorage.encryptString(JSON.stringify(session || {})).toString('base64'),
    };
  }
  await fs.writeFile(sessionPath(), JSON.stringify(payload, null, 2), 'utf8');
  return true;
}

async function clearStoredSession() {
  try {
    await fs.unlink(sessionPath());
  } catch {}
  return true;
}

function parseAuthTokens(url) {
  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.hash.replace(/^#/, '') || parsed.search.replace(/^\?/, ''));
    const accessToken = params.get('access_token');
    if (!accessToken) return null;
    return {
      access_token: accessToken,
      refresh_token: params.get('refresh_token') || '',
      token_type: params.get('token_type') || 'bearer',
      expires_in: Number(params.get('expires_in') || 0),
    };
  } catch {
    return null;
  }
}

function openGoogleAuthWindow(mode = 'login') {
  return new Promise((resolve, reject) => {
    const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
    authUrl.searchParams.set('provider', 'google');
    authUrl.searchParams.set('redirect_to', 'https://tack.design/account');
    authUrl.searchParams.set('prompt', 'select_account');
    authUrl.searchParams.set('access_type', 'offline');

    const authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      parent: mainWindow,
      modal: true,
      title: mode === 'signup' ? 'Create Tack account' : 'Sign in to Tack',
      backgroundColor: '#0e0c0a',
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    let settled = false;
    const finish = tokens => {
      if (settled) return;
      settled = true;
      authWindow.close();
      resolve(tokens);
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      authWindow.close();
      reject(error);
    };
    const inspectUrl = url => {
      const tokens = parseAuthTokens(url);
      if (tokens) finish(tokens);
    };

    authWindow.webContents.on('will-redirect', (_event, url) => inspectUrl(url));
    authWindow.webContents.on('will-navigate', (_event, url) => inspectUrl(url));
    authWindow.webContents.on('did-navigate', (_event, url) => inspectUrl(url));
    authWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      if (errorCode !== -3) fail(new Error(errorDescription || 'Google sign-in failed.'));
    });
    authWindow.on('closed', () => {
      if (!settled) reject(new Error('Google sign-in was cancelled.'));
    });

    authWindow.loadURL(authUrl.toString());
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    title: 'Tack Browser',
    icon: path.join(__dirname, 'assets', 'tack_app_icon.png'),
    backgroundColor: '#eef1ee',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') {
      return url.href;
    }
  } catch {}
  return '';
}

app.whenReady().then(() => {
  app.setName('Tack Browser');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-external', async (_event, url) => {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) return false;
  await shell.openExternal(safeUrl);
  return true;
});

ipcMain.handle('auth:get-session', readStoredSession);
ipcMain.handle('auth:set-session', async (_event, session) => writeStoredSession(session));
ipcMain.handle('auth:clear-session', clearStoredSession);
ipcMain.handle('auth:google', async (_event, mode) => openGoogleAuthWindow(mode));
