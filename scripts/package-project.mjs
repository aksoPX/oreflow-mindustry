import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

execFileSync('python', ['-c', `import pathlib,zipfile
root=pathlib.Path('.')
with zipfile.ZipFile('public/downloads/oreflow-project-0.2.0.zip','w',zipfile.ZIP_DEFLATED) as z:
 for folder in ['src','mod','scripts','docs','tests','public']:
  for p in (root/folder).rglob('*'):
   if not p.is_file() or p.name in ['oreflow-project-0.2.0.zip','project-checksum.txt']:continue
   if '__pycache__' in p.parts:continue
   z.write(p,'oreflow/'+str(p))
 for name in ['README.md','package.json','package-lock.json','vite.config.ts','tsconfig.json','playwright.config.ts','index.html']:
  z.write(root/name,'oreflow/'+name)
 z.write('public/downloads/oreflow-mod-0.2.0.zip','oreflow/mod/oreflow-mod-0.2.0.zip')
`], { stdio: 'inherit' });
const file = 'public/downloads/oreflow-project-0.2.0.zip';
const bytes = readFileSync(file);
writeFileSync('public/downloads/project-checksum.txt', `${createHash('sha256').update(bytes).digest('hex')}  oreflow-project-0.2.0.zip\n`);
console.log(`Complete project packaged: ${bytes.length} bytes`);