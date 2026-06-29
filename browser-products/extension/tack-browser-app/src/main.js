const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, shell, ipcMain, safeStorage } = require('electron');
const { nativePopupOptions, nativeWindowOptions } = require('./platform');

const SUPABASE_URL = 'https://sbdowcielgtcfholfyry.supabase.co';
const BROWSER_PARTITION = 'persist:tack-browser';

let mainWindow;
const authWindows = new Set();
let pinterestAuthOpening = false;
const SMOKE_TEST = process.argv.includes('--tack-smoke-test') || process.env.TACK_SMOKE_TEST === '1';
const SMOKE_SCREENSHOT = process.argv
  .find(argument => argument.startsWith('--tack-smoke-screenshot='))
  ?.slice('--tack-smoke-screenshot='.length) || process.env.TACK_SMOKE_SCREENSHOT;

async function runSmokeTest(window) {
  if (!SMOKE_TEST) return;
  try {
    const result = await window.webContents.executeJavaScript(`(() => {
      const required = [
        '#browser-view', '#address-input', '#select-btn', '#capture-btn',
        '#reference-list', '#subject-input', '#generate-btn',
        '#rail-browser-btn', '#rail-library-btn', '#rail-account-btn'
      ];
      const missing = required.filter(selector => !document.querySelector(selector));
      return {
        platform: document.body.dataset.platform,
        platformClass: document.body.classList.contains('platform-${process.platform === 'win32' ? 'windows' : 'mac'}'),
        missing,
        title: document.title,
        railPaddingTop: getComputedStyle(document.querySelector('.rail')).paddingTop,
      };
    })()`);

    if (result.platform !== process.platform || !result.platformClass || result.missing.length) {
      throw new Error(`Smoke assertion failed: ${JSON.stringify(result)}`);
    }

    const screenshotPath = SMOKE_SCREENSHOT;
    if (screenshotPath) {
      await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
      const image = await window.webContents.capturePage();
      await fs.writeFile(screenshotPath, image.toPNG());
    }
    console.log(`TACK_SMOKE_OK ${JSON.stringify(result)}`);
    app.exit(0);
  } catch (error) {
    console.error(`TACK_SMOKE_FAILED ${error?.stack || error}`);
    app.exit(1);
  }
}

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
  const payload = safeStorage.isEncryptionAvailable()
    ? {
        encrypted: true,
        encoding: 'base64',
        data: safeStorage.encryptString(JSON.stringify(session || {})).toString('base64'),
      }
    : { ...(session || {}), encrypted: false };
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
      ...nativePopupOptions(),
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

function popupWindowOptions(parent = mainWindow) {
  return {
    width: 560,
    height: 740,
    minWidth: 420,
    minHeight: 560,
    parent,
    modal: false,
    show: true,
    ...nativePopupOptions(),
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: BROWSER_PARTITION,
    },
  };
}

function allowSharedPopup(webContents, parent = mainWindow) {
  webContents.setWindowOpenHandler(({ url }) => {
    const isInitialPopup = !url || url.startsWith('about:blank');
    const shouldAllow = isInitialPopup || safeExternalUrl(url);
    return {
      action: shouldAllow ? 'allow' : 'deny',
      overrideBrowserWindowOptions: popupWindowOptions(parent),
    };
  });

  if (!webContents.__tackPinterestAuthBridge) {
    webContents.__tackPinterestAuthBridge = true;
    webContents.on('console-message', async (...args) => {
      const details = args.find(arg => arg && typeof arg === 'object' && typeof arg.message === 'string');
      const message = details?.message || args.find(arg => typeof arg === 'string') || '';
      if (!message.startsWith('__TACK_PINTEREST_AUTH__') || pinterestAuthOpening) return;

      pinterestAuthOpening = true;
      let url = webContents.getURL();
      try {
        url = JSON.parse(message.replace('__TACK_PINTEREST_AUTH__', '')).url || url;
      } catch {}
      try {
        await openPinterestAuthWindow(url);
      } finally {
        pinterestAuthOpening = false;
      }
    });
  }

  webContents.on('did-create-window', child => {
    allowSharedPopup(child.webContents, child);
    child.once('ready-to-show', () => {
      child.show();
      child.focus();
    });
  });
}

function pinterestAuthUrl(value) {
  const safeUrl = safeExternalUrl(value);
  if (!safeUrl) return 'https://www.pinterest.com/login/';
  try {
    const url = new URL(safeUrl);
    return /(^|\.)pinterest\.com$/i.test(url.hostname) ? url.href : 'https://www.pinterest.com/login/';
  } catch {
    return 'https://www.pinterest.com/login/';
  }
}

function openPinterestAuthWindow(startUrl) {
  return new Promise(resolve => {
    const authWindow = new BrowserWindow({
      ...popupWindowOptions(mainWindow),
      width: 980,
      height: 780,
      minWidth: 760,
      title: 'Sign in to Pinterest',
    });

    authWindows.add(authWindow);
    allowSharedPopup(authWindow.webContents, authWindow);
    authWindow.once('ready-to-show', () => {
      authWindow.show();
      authWindow.focus();
    });
    authWindow.on('closed', () => {
      authWindows.delete(authWindow);
      resolve(true);
    });
    authWindow.loadURL(pinterestAuthUrl(startUrl));
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
    ...nativeWindowOptions(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });

  mainWindow.webContents.on('did-attach-webview', (_event, webContents) => {
    allowSharedPopup(webContents);
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer.html'))
    .then(() => runSmokeTest(mainWindow))
    .catch(error => {
      console.error(error);
      if (SMOKE_TEST) app.exit(1);
    });
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
ipcMain.handle('auth:pinterest-window', async (_event, url) => openPinterestAuthWindow(url));
