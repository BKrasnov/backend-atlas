/* Optional server sync. Remembered access stays in this browser, never in exports. */
(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const atlas = window.atlasWorkspace;
    if (!atlas) { delete document.documentElement.dataset.atlasAccess; return; }
    const CONFIG = 'backend-atlas-server-url';
    const CONNECTION = 'backend-atlas-server-connection';
    const BACKUP = 'backend-atlas-before-server-import';
    let endpoint = '', token = '', revision = null, remote = null;
    let connected = false, paused = false, applying = false, busy = false;
    let generation = 0, changed = 0, uploaded = 0, timer, retryTimer, retries = 0;
    let remembered = false, storageWarning = false;
    let accessLocked = false;
    let status = 'Локальный режим';
    try { endpoint = localStorage.getItem(CONFIG) || ''; } catch {}
    if (!endpoint) endpoint = document.querySelector('meta[name="atlas-api-url"]')?.content || '';
    if (!endpoint && /^https?:$/.test(location.protocol) && !location.hostname.endsWith('.github.io')) endpoint = location.origin;
    try {
      const saved = JSON.parse(localStorage.getItem(CONNECTION));
      if (saved && typeof saved.token === 'string' && saved.token.length >= 32 && saved.token.length <= 512 && !/\s/.test(saved.token) && Number.isSafeInteger(saved.revision) && saved.revision >= 0) {
        endpoint = normalizeUrl(saved.endpoint); token = saved.token; revision = saved.revision;
        remembered = connected = paused = true;
        changed = saved.pending ? 1 : 0;
      }
    } catch {}

    const button = document.createElement('button');
    button.className = 'side-help';
    button.dataset.syncAction = 'settings';
    button.innerHTML = icon('cloud') + 'Сервер и синхронизация';
    const indicator = document.createElement('p');
    indicator.id = 'server-sync-status';
    indicator.className = 'profile-hint';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    const host = document.querySelector('.side-bottom');
    host.prepend(indicator); host.prepend(button);
    function setStatus(value) { status = value; indicator.textContent = value; for (const el of document.querySelectorAll('#sync-feedback, #atlas-login-feedback')) el.textContent = value; }
    setStatus(status);

    function lockAccess() {
      accessLocked = true;
      document.documentElement.dataset.atlasAccess = 'locked';
      document.querySelector('.app').inert = true;
      closeDialog();
      let dialog = document.querySelector('#atlas-access-dialog');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'atlas-access-dialog'; dialog.className = 'dialog';
        dialog.setAttribute('aria-labelledby', 'atlas-login-title');
        dialog.innerHTML = `<div class="dialog-head"><h2 id="atlas-login-title">Вход в Backend Atlas</h2></div><div class="dialog-body"><p class="x-small">Введите ключ доступа, чтобы открыть атлас и загрузить ваши данные с сервера.</p><form id="atlas-login-form" class="x-form" style="margin-top:18px"><label class="x-field">Ключ доступа<input id="atlas-login-key" type="password" autocomplete="off" required placeholder="Ключ доступа к атласу"></label><p id="atlas-login-feedback" class="x-small" role="status" aria-live="polite"></p><button class="btn btn-primary" type="submit">Войти</button></form><p class="x-small" style="margin-top:16px">После входа ключ запомнится в этом браузере.</p></div>`;
        dialog.addEventListener('cancel', event => event.preventDefault());
        dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); login().catch(report); });
        document.body.append(dialog);
      }
      dialog.querySelector('#atlas-login-feedback').textContent = status;
      if (!dialog.open) dialog.showModal();
    }
    function unlockAccess() {
      accessLocked = false;
      delete document.documentElement.dataset.atlasAccess;
      document.querySelector('.app').inert = false;
      document.querySelector('#atlas-access-dialog')?.remove();
    }
    async function login() {
      if (busy) return;
      const field = document.querySelector('#atlas-login-key');
      const nextToken = field.value.trim();
      if (!nextToken) return;
      endpoint = normalizeUrl(endpoint); token = nextToken; field.value = '';
      const attempt = ++generation;
      busy = true; setStatus('Проверяем ключ и загружаем данные…');
      try {
        const result = await request('GET');
        if (attempt !== generation) return;
        remote = result; revision = result.revision;
        if (result.workspace) applyRemote(result.workspace);
        changed = uploaded = 0; connected = true; paused = false; retries = 0;
        if (!result.workspace) ++changed;
        rememberConnection(); unlockAccess(); setStatus('Синхронизировано');
      } finally { busy = false; }
      schedule();
    }
    function normalizeUrl(value) {
      const url = new URL(value.trim());
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.username || url.password || url.search || url.hash || /%2f|%5c/i.test(url.pathname)) throw Error('Введите адрес API без логина, пароля и параметров, например https://example.com/atlas-api.');
      if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw Error('Для сервера нужен HTTPS. HTTP разрешён только на localhost.');
      return url.origin + url.pathname.replace(/\/+$/, '');
    }
    function settings() {
      openDialog('Сервер и синхронизация', `<p class="x-small">Подключите собственный сервер, чтобы продолжать работу с одним профилем на разных устройствах. Локальная копия сохраняется в браузере.</p><div class="x-form" style="margin-top:16px"><label class="x-field">Адрес сервера<input id="sync-url" type="url" value="${esc(endpoint)}" placeholder="https://atlas.example.com" autocomplete="url"></label><label class="x-field">Ключ доступа<input id="sync-token" type="password" autocomplete="off" placeholder="${token ? (remembered ? 'Ключ сохранён в этом браузере' : 'Ключ уже введён') : 'Ключ из настроек вашего сервера'}"></label></div><div class="x-note">Подключение запоминается в этом браузере и восстанавливается после перезагрузки. Ключ не включается в HTML и JSON-экспорты. Кнопка «Отключить» удаляет сохранённый ключ.</div><p id="sync-feedback" class="x-small" role="status">${esc(status)}</p><div class="x-row" style="margin-top:15px"><button class="btn btn-primary" data-sync-action="connect">Проверить подключение</button>${connected || token ? '<button class="btn" data-sync-action="disconnect">Отключить</button>' : ''}<button class="btn" data-sync-action="backup">Скачать локальную копию · JSON</button>${hasBackup() ? '<button class="btn" data-sync-action="download-backup">Копия до загрузки с сервера</button>' : ''}</div><p class="x-small" style="margin-top:15px">На GitHub Pages укажите HTTPS-адрес API на VPS. Сам GitHub Pages хранит только страницу атласа.</p>`, '<button class="btn" data-action="close-dialog">Закрыть</button>');
    }
    function rememberConnection() {
      if (!connected || !token || revision === null) return;
      try {
        localStorage.setItem(CONNECTION, JSON.stringify({endpoint, token, revision, pending:changed !== uploaded}));
        localStorage.setItem(CONFIG, endpoint); remembered = true;
      } catch {
        if (!storageWarning) notify('Браузер не смог запомнить подключение. Освободите место в хранилище; до закрытия вкладки синхронизация продолжит работать.');
        storageWarning = true;
      }
    }
    function forgetConnection() {
      localStorage.removeItem(CONNECTION); remembered = false;
    }
    function applyRemote(workspace) {
      try { localStorage.setItem(BACKUP, JSON.stringify(atlas.read())); }
      catch { throw Error('Не удалось создать локальную резервную копию. Освободите место в хранилище браузера перед загрузкой.'); }
      applying = true;
      try { atlas.replace(workspace); }
      finally { applying = false; }
    }
    function hasBackup() { try { return !!localStorage.getItem(BACKUP); } catch { return false; } }
    function backup(value = atlas.read()) {
      downloadText(JSON.stringify({app:'backend-atlas-workspace',exportVersion:5,exportedAt:new Date().toISOString(),workspace:value}, null, 2), filename('local-backup', 'json'), 'application/json;charset=utf-8');
    }
    async function request(method, workspace, expectedRevision) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const headers = {Authorization:'Bearer ' + token};
        const options = {method, headers, signal:controller.signal, cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer'};
        if (method === 'PUT') { headers['Content-Type'] = 'application/json'; headers['If-Match'] = '"' + expectedRevision + '"'; options.body = JSON.stringify(workspace); }
        const response = await fetch(endpoint + '/api/workspace', options);
        let body; try { body = await response.json(); } catch { throw Error('Сервер вернул неподходящий ответ. Проверьте адрес API.'); }
        if (!response.ok) { const error = new Error(body.error || 'Не удалось обратиться к серверу.'); error.status = response.status; throw error; }
        if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw Error('Сервер вернул некорректный номер версии.');
        return body;
      } catch (error) {
        if (error.name === 'AbortError') throw Error('Сервер не ответил за 15 секунд. Локальная копия сохранена.');
        if (error instanceof TypeError) throw Error('Сервер недоступен. Проверьте адрес, HTTPS и разрешённый адрес сайта на сервере.');
        throw error;
      } finally { clearTimeout(timeout); }
    }
    function choose() {
      const profile = remote.workspace?.candidates?.[0]?.profile;
      openDialog('Выберите источник данных', `<p>Локальный кандидат: <strong>${esc(atlas.read().candidates[0].profile.candidate || 'Без имени')}</strong>.</p><p>На сервере: <strong>${profile ? esc(profile.candidate || 'Без имени') : 'Профиль пока не сохранён'}</strong>.</p><div class="x-note warning">Выберите, какие данные использовать. Отправка заменит серверную версию. Перед загрузкой серверной версии в браузере сохранится резервная копия текущего профиля.</div><div class="x-row"><button class="btn btn-primary" data-sync-action="push">Отправить локальный атлас на сервер</button>${profile ? '<button class="btn" data-sync-action="pull">Загрузить атлас с сервера</button>' : ''}<button class="btn" data-sync-action="backup">Скачать локальную копию · JSON</button></div>`, '<button class="btn" data-action="close-dialog">Отмена</button>');
    }
    async function connect() {
      if (busy) return;
      const urlField = document.querySelector('#sync-url');
      const tokenField = document.querySelector('#sync-token');
      const nextUrl = normalizeUrl(urlField?.value || endpoint);
      const nextToken = tokenField?.value.trim() || token;
      if (!nextToken) throw Error('Введите ключ доступа.');
      forgetConnection(); clearTimeout(timer); clearTimeout(retryTimer); connected = false; paused = false;
      endpoint = nextUrl; token = nextToken;
      if (tokenField) tokenField.value = '';
      const attempt = ++generation;
      busy = true; setStatus('Подключение к серверу…');
      try {
        const result = await request('GET');
        if (attempt !== generation) return;
        remote = result; revision = result.revision; retries = 0;
        try { localStorage.setItem(CONFIG, endpoint); } catch {}
        setStatus('Выберите источник данных'); choose();
      } finally { busy = false; }
    }
    async function resume() {
      if (busy || !connected || !token) return;
      clearTimeout(retryTimer);
      const attempt = generation;
      busy = true; paused = true; setStatus('Подключение к серверу…');
      try {
        const result = await request('GET');
        if (attempt !== generation) return;
        remote = result;
        // A successful GET confirms the remembered key before showing cached content.
        unlockAccess();
        if (changed !== uploaded) {
          if (result.revision !== revision) {
            const error = Error('На сервере есть другая версия. Локальные правки сохранены. Откройте синхронизацию и выберите источник данных.');
            error.status = 409; throw error;
          }
        } else {
          if (result.workspace) applyRemote(result.workspace);
          else ++changed;
          revision = result.revision;
        }
        paused = false; retries = 0; rememberConnection();
        setStatus('Синхронизировано');
      } finally { busy = false; }
      schedule();
    }
    function schedule() {
      clearTimeout(timer);
      if (!connected || paused || busy || changed === uploaded) return;
      setStatus('Сохраняется на сервере…');
      timer = setTimeout(() => upload().catch(report), 800);
    }
    async function upload(explicit = false) {
      if (busy || (!explicit && (!connected || paused))) return;
      if (revision === null) throw Error('Сначала проверьте подключение.');
      clearTimeout(timer);
      const attempt = generation, version = changed;
      const snapshot = atlas.read();
      busy = true; setStatus('Сохраняется на сервере…');
      try {
        const result = await request('PUT', snapshot, revision);
        if (attempt !== generation) return;
        revision = result.revision; uploaded = version; connected = true; paused = false; retries = 0;
        clearTimeout(retryTimer); rememberConnection();
        if (explicit) closeDialog();
        setStatus('Синхронизировано');
      } finally { busy = false; }
      if (changed !== uploaded) schedule();
    }
    function pull() {
      if (busy || !remote?.workspace) return;
      applyRemote(remote.workspace);
      changed = uploaded = 0; connected = true; paused = false;
      revision = remote.revision; retries = 0; rememberConnection(); closeDialog(); setStatus('Синхронизировано');
    }
    function disconnect() {
      forgetConnection(); ++generation; clearTimeout(timer); clearTimeout(retryTimer); connected = false; paused = false; token = ''; remote = null; revision = null;
      setStatus('Введите ключ доступа'); closeDialog(); if (endpoint) lockAccess();
    }
    function report(error) {
      paused = true;
      clearTimeout(retryTimer);
      if (error.status === 401) { forgetConnection(); token = ''; connected = false; if (endpoint) lockAccess(); }
      setStatus(error.status === 409 ? 'Конфликт версий — откройте синхронизацию' : 'Синхронизация приостановлена');
      if (!retries) notify(error.message);
      const el = document.querySelector('#sync-feedback'); if (el) el.textContent = error.message;
      const loginFeedback = document.querySelector('#atlas-login-feedback'); if (loginFeedback) loginFeedback.textContent = error.message;
      if (connected && (!error.status || error.status >= 500) && error.retryable !== false) {
        const delay = Math.min(30000, 2000 * 2 ** Math.min(retries++, 4));
        retryTimer = setTimeout(() => resume().catch(report), delay);
      }
    }
    document.addEventListener('atlas:change', () => { if (applying || accessLocked) return; ++changed; rememberConnection(); schedule(); });
    document.addEventListener('click', event => {
      const action = event.target.closest('[data-sync-action]')?.dataset.syncAction;
      if (!action) return;
      event.preventDefault();
      Promise.resolve().then(() => {
        if (action === 'settings') settings();
        if (action === 'connect') return connect();
        if (action === 'push') return upload(true);
        if (action === 'pull') return pull();
        if (action === 'disconnect') disconnect();
        if (action === 'backup') backup();
        if (action === 'download-backup') { const raw = localStorage.getItem(BACKUP); if (raw) backup(JSON.parse(raw)); }
      }).catch(report);
    });
    window.addEventListener('online', () => { if (connected && paused && !status.startsWith('Конфликт')) resume().catch(report); });
    window.addEventListener('beforeunload', event => { if (connected && changed !== uploaded) { event.preventDefault(); event.returnValue = ''; } });
    if (endpoint && /^https?:$/.test(location.protocol)) {
      setStatus(remembered ? 'Проверяем сохранённый ключ…' : 'Введите ключ доступа');
      lockAccess();
      if (remembered) resume().catch(report);
    } else unlockAccess();
  }, {once:true});
})();
