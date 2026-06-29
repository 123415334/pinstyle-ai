import { spawnSync } from 'node:child_process';
import process from 'node:process';

if (process.platform !== 'win32') {
  console.error('Windows release installers must be built and smoke-tested on Windows.');
  console.error('Use `npm run package:win` on macOS only for an internal cross-platform app bundle.');
  process.exit(1);
}

if (!process.env.CSC_LINK && process.env.TACK_ALLOW_UNSIGNED_WINDOWS !== '1') {
  console.error('Refusing to create an unsigned Windows release installer.');
  console.error('Configure CSC_LINK/CSC_KEY_PASSWORD, or set TACK_ALLOW_UNSIGNED_WINDOWS=1 for internal QA only.');
  process.exit(1);
}

const icon = spawnSync(process.execPath, ['scripts/create-windows-icon.mjs'], { stdio: 'inherit' });
if (icon.status !== 0) process.exit(icon.status ?? 1);

const builder = spawnSync(
  process.execPath,
  ['node_modules/electron-builder/out/cli/cli.js', '--win', 'nsis', '--x64'],
  { stdio: 'inherit', env: process.env },
);
process.exit(builder.status ?? 1);
