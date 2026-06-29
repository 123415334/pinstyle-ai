'use strict';

function platformInfo(platform = process.platform) {
  const isMac = platform === 'darwin';
  const isWindows = platform === 'win32';
  return {
    platform,
    isMac,
    isWindows,
    systemName: isMac ? 'Mac' : isWindows ? 'Windows' : 'desktop',
  };
}

function nativeWindowOptions(platform = process.platform) {
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 18 },
    };
  }
  return {
    titleBarStyle: 'default',
    autoHideMenuBar: true,
  };
}

function nativePopupOptions(platform = process.platform) {
  return platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {};
}

module.exports = { nativePopupOptions, nativeWindowOptions, platformInfo };
