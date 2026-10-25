import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'backend-atlas-single-candidate.html');
let html = await readFile(source, 'utf8');
const sync = await readFile(resolve(root, 'client/sync.js'), 'utf8');
const editor = await readFile(resolve(root, 'client/diagram-editor.js'), 'utf8');
const editorCss = await readFile(resolve(root, 'client/diagram-editor.css'), 'utf8');
const calendar = await readFile(resolve(root, 'client/learning-calendar.js'), 'utf8');
const calendarCss = await readFile(resolve(root, 'client/learning-calendar.css'), 'utf8');
const marker = /<!-- atlas-server-sync:start -->[\s\S]*?<!-- atlas-server-sync:end -->\s*/;
html = html.replace(marker, '');
html = html.replace(/<!-- atlas-diagram-editor:start -->[\s\S]*?<!-- atlas-diagram-editor:end -->\s*/, '');
html = html.replace(/<!-- atlas-diagram-styles:start -->[\s\S]*?<!-- atlas-diagram-styles:end -->\s*/, '');
html = html.replace(/<!-- atlas-learning-calendar:start -->[\s\S]*?<!-- atlas-learning-calendar:end -->\s*/, '');
html = html.replace(/<!-- atlas-calendar-styles:start -->[\s\S]*?<!-- atlas-calendar-styles:end -->\s*/, '');
const firstCodeScript = html.indexOf('<script>');
if (firstCodeScript < 0) throw Error('Не найдена точка подключения атласа.');
const block = '<!-- atlas-diagram-editor:start -->\n<script>\n' + editor.replace(/<\/script/gi, '<\\/script') + '\n</script>\n<!-- atlas-diagram-editor:end -->\n<!-- atlas-server-sync:start -->\n<script>\n' + sync.replace(/<\/script/gi, '<\\/script') + '\n</script>\n<!-- atlas-server-sync:end -->\n';
const calendarBlock = '<!-- atlas-learning-calendar:start -->\n<script>\n' + calendar.replace(/<\/script/gi, '<\\/script') + '\n</script>\n<!-- atlas-learning-calendar:end -->\n';
html = html.slice(0, firstCodeScript) + calendarBlock + block + html.slice(firstCodeScript);
html = html.replace('</head>', '<!-- atlas-diagram-styles:start -->\n<style>\n' + editorCss + '\n</style>\n<!-- atlas-diagram-styles:end -->\n</head>');
html = html.replace('</head>', '<!-- atlas-calendar-styles:start -->\n<style>\n' + calendarCss + '\n</style>\n<!-- atlas-calendar-styles:end -->\n</head>');
// Keep the downloadable source fully standalone, with its inline sync client.
await writeFile(source, html, 'utf8');
// A public deployment must never publish a candidate snapshot embedded in a saved HTML.
let publicHtml = html.replace(/<script\b[^>]*\bid=["']atlas-profile-data["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');
publicHtml = publicHtml.replace(/<meta\b[^>]*\bname=["']atlas-api-url["'][^>]*>\s*/gi, '');
if (process.env.ATLAS_API_URL) {
  const api = new URL(process.env.ATLAS_API_URL);
  if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash) throw Error('ATLAS_API_URL must be an HTTPS API URL without credentials or parameters.');
  const apiUrl = (api.origin + api.pathname.replace(/\/+$/, '')).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  publicHtml = publicHtml.replace('</head>', `<meta name="atlas-api-url" content="${apiUrl}">\n</head>`);
}
await mkdir(resolve(root, 'public'), {recursive:true});
await writeFile(resolve(root, 'public/index.html'), publicHtml, 'utf8');
await writeFile(resolve(root, 'public/.nojekyll'), '', 'utf8');
console.log('Built public/index.html; embedded candidate snapshots excluded.');
