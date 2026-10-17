import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'backend-atlas-single-candidate.html');
let html = await readFile(source, 'utf8');
const sync = await readFile(resolve(root, 'client/sync.js'), 'utf8');
const marker = /<!-- atlas-server-sync:start -->[\s\S]*?<!-- atlas-server-sync:end -->\s*/;
html = html.replace(marker, '');
const firstCodeScript = html.indexOf('<script>');
if (firstCodeScript < 0) throw Error('Не найдена точка подключения атласа.');
const block = '<!-- atlas-server-sync:start -->\n<script>\n' + sync.replace(/<\/script/gi, '<\\/script') + '\n</script>\n<!-- atlas-server-sync:end -->\n';
html = html.slice(0, firstCodeScript) + block + html.slice(firstCodeScript);
// Keep the downloadable source fully standalone, with its inline sync client.
await writeFile(source, html, 'utf8');
// A public deployment must never publish a candidate snapshot embedded in a saved HTML.
const publicHtml = html.replace(/<script\b[^>]*\bid=["']atlas-profile-data["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');
await mkdir(resolve(root, 'public'), {recursive:true});
await writeFile(resolve(root, 'public/index.html'), publicHtml, 'utf8');
await writeFile(resolve(root, 'public/.nojekyll'), '', 'utf8');
console.log('Built public/index.html; embedded candidate snapshots excluded.');
