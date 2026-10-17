import './build.mjs';
import { cp, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = await mkdtemp(join(tmpdir(), 'atlas-package-'));
const output = resolve(root, 'output/backend-atlas-deploy.tar.gz');
try {
  const files = ['README.md','package.json','.env.example','.gitignore','.gitattributes','.dockerignore','Dockerfile','compose.yaml'];
  for (const file of files) await copyFile(resolve(root, file), join(stage, file));
  for (const dir of ['client','server','scripts','deploy','tests','.github']) await cp(resolve(root, dir), join(stage, dir), {recursive:true});
  // Distribute the clean public source, even if the author's source had a saved profile.
  await copyFile(resolve(root, 'public/index.html'), join(stage, 'backend-atlas-single-candidate.html'));
  await mkdir(resolve(root, 'output'), {recursive:true});
  const result = spawnSync('tar', ['-czf', output, '-C', stage, '.'], {stdio:'inherit',shell:false});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('Archive creation failed.');
  console.log(`Created ${output}`);
} finally {
  const expectedPrefix = resolve(tmpdir(), 'atlas-package-');
  if (!resolve(stage).startsWith(expectedPrefix)) throw Error('Unexpected staging directory; cleanup refused.');
  await rm(stage, {recursive:true, force:true});
}
