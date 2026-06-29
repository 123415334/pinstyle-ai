import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[2] || '.');
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const errors = [];

if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
if (!manifest.side_panel?.default_path) errors.push('side_panel.default_path is required for Chrome and Edge');
if (!manifest.background?.service_worker) errors.push('background.service_worker is required');

const requiredFiles = [
  manifest.side_panel?.default_path,
  manifest.background?.service_worker,
  ...Object.values(manifest.icons || {}),
].filter(Boolean);

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`missing ${relativePath}`);
}

for (const htmlFile of fs.readdirSync(root).filter(file => file.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
  for (const match of html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
    const relativePath = match[1];
    if (/^(?:https?:|data:|\/)/.test(relativePath)) continue;
    if (!fs.existsSync(path.join(root, relativePath))) errors.push(`${htmlFile} references missing ${relativePath}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`Extension validation: ${error}`);
  process.exit(1);
}

console.log(`Validated ${manifest.name} ${manifest.version} for Chromium browsers.`);
