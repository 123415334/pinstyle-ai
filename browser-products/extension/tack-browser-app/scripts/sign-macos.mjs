#!/usr/bin/env node
import { sign } from '@electron/osx-sign';

const args = process.argv.slice(2);

function readArg(name) {
  const prefix = `--${name}=`;
  const inline = args.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index === -1 ? '' : args[index + 1] || '';
}

const app = readArg('app') || args.find(arg => arg.endsWith('.app'));
if (!app) {
  console.error('Missing --app path.');
  process.exit(1);
}

const entitlements = readArg('entitlements');
const entitlementsInherit = readArg('entitlements-inherit');

await sign({
  app,
  identity: readArg('identity') || undefined,
  keychain: readArg('keychain') || undefined,
  platform: readArg('platform') || undefined,
  type: readArg('type') || undefined,
  provisioningProfile: readArg('provisioning-profile') || undefined,
  optionsForFile(filePath) {
    if (!entitlements && !entitlementsInherit) return {};
    if (filePath === app) {
      return entitlements ? { entitlements } : {};
    }
    return entitlementsInherit ? { entitlements: entitlementsInherit } : {};
  },
});

console.log(`Application signed: ${app}`);
