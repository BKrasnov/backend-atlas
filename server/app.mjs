import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError, openStore } from './store.mjs';

export async function createAtlasServer({token, dataFile, htmlFile, allowedOrigins = [], publicOrigin = '', maxBytes = 20 * 1024 * 1024}) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 512 || /\s/.test(token))
    throw new Error('Задайте ATLAS_TOKEN: случайный ключ длиной от 32 до 512 символов без пробелов.');
  const tokenHash = createHash('sha256').update(token).digest();
  const origins = new Set(allowedOrigins.filter(Boolean));
  if (publicOrigin) origins.add(new URL(publicOrigin).origin);
  const store = await openStore(dataFile);
  // Only a built, public HTML file is served. No directory traversal or directory listing.
  const html = await readFile(htmlFile);
  function send(res, status, data, extra = {}) {
    res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', ...extra});
    res.end(JSON.stringify(data));
  }
  function authorize(req) {
    const received = req.headers.authorization || '';
    if (!received.startsWith('Bearer ') || !timingSafeEqual(tokenHash, createHash('sha256').update(received.slice(7)).digest()))
      throw new HttpError(401, 'Неверный ключ доступа.');
  }
  async function readBody(req) {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Ожидается application/json.');
    if (Number(req.headers['content-length']) > maxBytes) { req.resume(); throw new HttpError(413, 'Атлас превышает 20 МБ.'); }
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) throw new HttpError(413, 'Атлас превышает 20 МБ.');
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new HttpError(400, 'Некорректный JSON.'); }
  }
  return createServer({requestTimeout:30000, headersTimeout:15000, maxHeaderSize:16384}, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    try {
      const pathname = new URL(req.url, 'http://atlas.invalid').pathname;
      if (pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        const sameOrigin = `http://${req.headers.host}`;
        if (origin && !origins.has(origin) && origin !== sameOrigin) throw new HttpError(403, 'Этот адрес сайта не разрешён сервером.');
        if (origin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Expose-Headers', 'ETag');
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {'Access-Control-Allow-Methods':'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers':'Authorization, Content-Type, If-Match', 'Access-Control-Max-Age':'600'});
          res.end(); return;
        }
        if (pathname === '/api/health' && req.method === 'GET') { send(res, 200, {ok:true}); return; }
        if (pathname !== '/api/workspace') throw new HttpError(404, 'Не найдено.');
        authorize(req);
        if (req.method === 'GET') {
          const snapshot = store.read();
          send(res, 200, snapshot, {ETag:`"${snapshot.revision}"`}); return;
        }
        if (req.method === 'PUT') {
          const precondition = req.headers['if-match'];
          if (!precondition) throw new HttpError(428, 'Требуется номер версии If-Match.');
          if (!/^"(?:0|[1-9]\d*)"$/.test(precondition) || !Number.isSafeInteger(Number(precondition.slice(1,-1))))
            throw new HttpError(400, 'Некорректная версия If-Match.');
          const workspace = await readBody(req);
          const saved = await store.write(Number(precondition.slice(1,-1)), workspace);
          send(res, 200, saved, {ETag:`"${saved.revision}"`}); return;
        }
        res.setHeader('Allow', 'GET, PUT, OPTIONS');
        throw new HttpError(405, 'Метод не поддерживается.');
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && ['/', '/index.html'].includes(pathname)) {
        res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Content-Length':html.length});
        res.end(req.method === 'HEAD' ? undefined : html); return;
      }
      throw new HttpError(404, 'Не найдено.');
    } catch (error) {
      if (!res.headersSent) send(res, error.status || 500, {error:error.status ? error.message : 'Не удалось сохранить или прочитать данные. Локальная копия остаётся в браузере.'});
      else res.end();
      if (!error.status) console.error('Atlas request failed:', error.code || error.name);
    }
  });
}
