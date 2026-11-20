import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

mkdirSync('public/downloads', { recursive: true });
execFileSync('npx', ['tsc', 'mod/shared/engine.ts', '--target', 'ES5', '--module', 'commonjs', '--outDir', 'mod/scripts', '--lib', 'ES2015', '--skipLibCheck', '--strict', '--types', 'node'], { stdio: 'inherit' });
copyFileSync('public/mindustry-license.txt', 'mod/LICENSE.txt');
copyFileSync('docs/MECHANICS.md', 'mod/MECHANICS.md');
copyFileSync('README.md', 'mod/README.md');
const file = 'public/downloads/oreflow-mod-0.2.0.zip';
execFileSync('python3', ['-c', `import pathlib,zipfile
with zipfile.ZipFile('${file}','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['mod.hjson','scripts/main.js','scripts/engine.js','scripts/selftest.js','MECHANICS.md','README.md','LICENSE.txt']:
  p=pathlib.Path('mod')/name
  info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
  z.writestr(info,p.read_bytes())
with zipfile.ZipFile('${file}') as z:
 assert z.testzip() is None
 assert 'mod.hjson' in z.namelist()
`]);
const bytes = readFileSync(file);
copyFileSync(file, 'mod/oreflow-mod-0.2.0.zip');
writeFileSync('public/downloads/mod-manifest.json', JSON.stringify({ name: 'oreflow-mod-0.2.0.zip', version: '0.2.0', format: 'Mindustry native JavaScript mod ZIP', file: '/downloads/oreflow-mod-0.2.0.zip', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), engine: 'shared TypeScript compiled to ES5 CommonJS', targets: ['v146', 'v160.8'] }, null, 2));
console.log(`Mod packaged: ${bytes.length} bytes`);