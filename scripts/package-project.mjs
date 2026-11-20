import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

execFileSync('python3', ['-c', `import pathlib,zipfile,io
root=pathlib.Path('.')
with zipfile.ZipFile('public/downloads/oreflow-project-0.2.0.zip','w',zipfile.ZIP_DEFLATED) as z:
 for folder in ['src','mod','scripts','docs','tests','public']:
  for p in (root/folder).rglob('*'):
   if not p.is_file() or p.name in ['oreflow-project-0.2.0.zip','project-checksum.txt']:continue
   if '__pycache__' in p.parts:continue
   z.write(p,str(p))
 for name in ['.gitignore','README.md','package.json','package-lock.json','vite.config.ts','tsconfig.json','playwright.config.ts','index.html']:
  z.write(root/name,name)
with zipfile.ZipFile('public/downloads/oreflow-project-0.2.0.zip') as z:
 assert z.testzip() is None
 assert 'mod/oreflow-mod-0.2.0.zip' in z.namelist()
 with zipfile.ZipFile(io.BytesIO(z.read('mod/oreflow-mod-0.2.0.zip'))) as nested:
  assert nested.testzip() is None
  assert 'mod.hjson' in nested.namelist()
`], { stdio: 'inherit' });
const file = 'public/downloads/oreflow-project-0.2.0.zip';
const bytes = readFileSync(file);
writeFileSync('public/downloads/project-checksum.txt', `${createHash('sha256').update(bytes).digest('hex')}  oreflow-project-0.2.0.zip\n`);
console.log(`Complete project packaged: ${bytes.length} bytes`);