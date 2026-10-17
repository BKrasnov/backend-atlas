import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateWorkspace(value) {
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
  if (!object(value) || value.version !== 5 || !Array.isArray(value.candidates) || value.candidates.length !== 1)
    throw new HttpError(400, 'Нужен атлас v5 с одним кандидатом.');
  const candidate = value.candidates[0];
  if (!object(candidate) || !id(candidate.id) || value.activeCandidate !== candidate.id ||
      !object(candidate.profile) || candidate.profile.version !== 1 || typeof candidate.profile.candidate !== 'string' || candidate.profile.candidate.length > 100)
    throw new HttpError(400, 'Некорректный профиль кандидата.');
  if (!Array.isArray(value.roles) || !value.roles.length || value.roles.length > 50 ||
      value.roles.some(role => !object(role) || !id(role.id) || typeof role.name !== 'string' || role.name.length > 100) ||
      new Set(value.roles.map(role => role.id)).size !== value.roles.length || !value.roles.some(role => role.id === candidate.roleId))
    throw new HttpError(400, 'Некорректные шаблоны вакансий.');
  if (!object(value.catalog) || ['tech', 'topics', 'questions'].some(key => !Array.isArray(value.catalog[key])))
    throw new HttpError(400, 'Некорректный каталог атласа.');
  if (!Array.isArray(value.packets) || value.packets.length > 1000 || value.packets.some(packet => !object(packet) || packet.candidateId !== candidate.id))
    throw new HttpError(400, 'Анкеты должны относиться к единственному кандидату.');
  for (const key of ['tech', 'techReview', 'techComments', 'topics', 'scores', 'notes', 'tasks']) {
    if (!object(candidate.profile[key])) throw new HttpError(400, `Некорректный раздел профиля: ${key}.`);
  }
  if (!Array.isArray(candidate.profile.favorites)) throw new HttpError(400, 'Некорректное избранное.');
  function visit(v, depth = 0) {
    if (depth > 40 || (typeof v === 'string' && v.length > 50000)) throw new HttpError(400, 'Превышен размер поля или вложенность данных.');
    if (v && typeof v === 'object') {
      if (Object.keys(v).length > 5000) throw new HttpError(400, 'Слишком много элементов.');
      for (const [key, child] of Object.entries(v)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new HttpError(400, 'Недопустимый ключ в данных.');
        visit(child, depth + 1);
      }
    }
  }
  visit(value);
  return value;
}

async function atomicWrite(file, contents) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close(); handle = null;
    await rename(temporary, file);
  } finally {
    await handle?.close();
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function openStore(file) {
  await mkdir(dirname(file), {recursive:true, mode:0o700});
  let current = {revision:0, updatedAt:null, workspace:null};
  try {
    current = JSON.parse(await readFile(file, 'utf8'));
    if (!Number.isSafeInteger(current.revision) || current.revision < 1) throw new Error('Invalid stored revision');
    validateWorkspace(current.workspace);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Хранилище не прочитано. Восстановите корректную резервную копию; файл не перезаписан.', {cause:error});
  }
  let queue = Promise.resolve();
  return {
    read: () => structuredClone(current),
    write(expectedRevision, workspace) {
      const task = queue.then(async () => {
        if (current.revision !== expectedRevision) throw new HttpError(409, 'На сервере уже другая версия. Загрузите её перед следующим сохранением.');
        validateWorkspace(workspace);
        const next = {revision:current.revision + 1, updatedAt:new Date().toISOString(), workspace};
        if (current.revision) await atomicWrite(file + '.bak', JSON.stringify(current));
        await atomicWrite(file, JSON.stringify(next));
        current = next;
        return {revision:next.revision, updatedAt:next.updatedAt};
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}
