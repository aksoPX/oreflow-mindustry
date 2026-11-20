import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

mkdirSync('public/downloads', { recursive: true });
execFileSync('npx', ['tsc', 'mod/shared/engine.ts', '--target', 'ES5', '--module', 'commonjs', '--outDir', 'mod/scripts', '--lib', 'ES2015', '--skipLibCheck', '--strict', '--types', 'node'], { stdio: 'inherit' });
copyFileSync('public/mindustry-license.txt', 'mod/LICENSE.txt');
copyFileSync('docs/MECHANICS.md', 'mod/MECHANICS.md');
const file = 'public/downloads/oreflow-mod-0.2.0.zip';
execFileSync('python', ['-c', `import pathlib,zipfile
with zipfile.ZipFile('${file}','w',zipfile.ZIP_DEFLATED) as z:
 for p in pathlib.Path('mod').rglob('*'):
  if p.is_file(): z.write(p,p.relative_to('mod'))
`]);
const bytes = readFileSync(file);
writeFileSync('public/downloads/mod-manifest.json', JSON.stringify({ version: '0.2.0', format: 'Mindustry native JavaScript mod ZIP', file: '/downloads/oreflow-mod-0.2.0.zip', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), engine: 'shared TypeScript compiled to ES5', targets: ['v146', 'v160.8'] }, null, 2));
console.log(`Mod packaged: ${bytes.length} bytes`);