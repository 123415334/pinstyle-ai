import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const artifactDir = path.join(root, 'test-artifacts');
const executable = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
);

await fs.rm(artifactDir, { recursive: true, force: true });
await fs.mkdir(artifactDir, { recursive: true });

const screenshotPath = path.join(artifactDir, `${process.platform}-smoke.png`);
const userDataPath = path.join(artifactDir, 'user-data');
const child = spawn(executable, [
  '.',
  '--tack-smoke-test',
  `--tack-smoke-screenshot=${screenshotPath}`,
  `--user-data-dir=${userDataPath}`,
], {
  cwd: root,
  shell: process.platform === 'win32',
  stdio: 'inherit',
  env: {
    ...process.env,
    TACK_SMOKE_TEST: '1',
    TACK_SMOKE_SCREENSHOT: screenshotPath,
  },
});

const timeout = setTimeout(() => {
  console.error('Tack smoke test timed out.');
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
  process.exit(1);
}, 45_000);

child.on('exit', code => {
  clearTimeout(timeout);
  process.exit(code ?? 1);
});
