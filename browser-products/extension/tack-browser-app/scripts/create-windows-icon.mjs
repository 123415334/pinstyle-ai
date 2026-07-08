import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const source = path.join(rootDir, 'build', 'tack.iconset', 'icon_256x256.png');
const destination = path.join(rootDir, 'build', 'tack.ico');

await fs.writeFile(destination, await pngToIco(source));
console.log(`Created ${path.relative(rootDir, destination)}`);
