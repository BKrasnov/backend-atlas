import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../.env', import.meta.url));
try {
  await writeFile(file, `ATLAS_TOKEN=${randomBytes(32).toString('hex')}\nHOST=127.0.0.1\nPORT=3000\nDATA_FILE=data/workspace.json\nPUBLIC_ORIGIN=\nALLOWED_ORIGINS=\n`, {flag:'wx',mode:0o600});
  console.log('Created .env with a random access key. Existing configuration is never replaced.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env already exists; kept unchanged.');
}
