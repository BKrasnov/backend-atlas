import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAtlasServer } from './app.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT должен быть от 1 до 65535.');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
for (const origin of allowedOrigins) if (new URL(origin).origin !== origin) throw new Error('ALLOWED_ORIGINS содержит только origin: https://owner.github.io, без пути.');
const server = await createAtlasServer({
  token:process.env.ATLAS_TOKEN,
  dataFile:resolve(root, process.env.DATA_FILE || 'data/workspace.json'),
  htmlFile:resolve(root, 'public/index.html'),
  publicOrigin:process.env.PUBLIC_ORIGIN,
  allowedOrigins,
});
server.listen(port, host, () => console.log(`Backend Atlas listening on http://${host}:${port}; PID ${process.pid}`));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
