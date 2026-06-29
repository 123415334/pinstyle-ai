'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { nativePopupOptions, nativeWindowOptions, platformInfo } = require('../src/platform');

test('macOS retains the existing inset title bar and traffic lights', () => {
  assert.deepEqual(nativeWindowOptions('darwin'), {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
  });
  assert.deepEqual(nativePopupOptions('darwin'), { titleBarStyle: 'hiddenInset' });
  assert.equal(platformInfo('darwin').systemName, 'Mac');
});

test('Windows uses native window controls and hides the application menu', () => {
  assert.deepEqual(nativeWindowOptions('win32'), {
    titleBarStyle: 'default',
    autoHideMenuBar: true,
  });
  assert.deepEqual(nativePopupOptions('win32'), {});
  assert.deepEqual(platformInfo('win32'), {
    platform: 'win32',
    isMac: false,
    isWindows: true,
    systemName: 'Windows',
  });
});
