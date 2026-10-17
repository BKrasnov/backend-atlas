/* Optional server sync. Credentials live only in this tab's memory. */
(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const atlas = window.atlasWorkspace;
    if (!atlas) return;
    const CONFIG = 'backend-atlas-server-url';
    const BACKUP = 'backend-atlas-before-server-import';
    let endpoint = '', token = '', revision = null, remote = null;
    let connected = false, paused = false, applying = false, busy = false;
    let generation = 0, changed = 0, uploaded = 0, timer;
    let status = 'Локальный режим';
    try { endpoint = localStorage.getItem(CONFIG) || ''; } catch {}
    if (!endpoint) endpoint = document.querySelector('meta[name="atlas-api-url"]')?.content || '';
    if (!endpoint && /^https?:$/.test(location.protocol) && !location.hostname.endsWith('.github.io')) endpoint = location.origin;

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
    function setStatus(value) { status = value; indicator.textContent = value; const el = document.querySelector('#sync-feedback'); if (el) el.textContent = value; }
    setStatus(status);

    function normalizeUrl(value) {
      const url = new URL(value.trim());
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.username || url.password || url.search || url.hash || /%2f|%5c/i.test(url.pathname)) throw Error('Введите адрес API без логина, пароля и параметров, например https://example.com/atlas-api.');
      if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw Error('Для сервера нужен HTTPS. HTTP разрешён только на localhost.');
      return url.origin + url.pathname.replace(/\/+$/, '');
    }
    function settings() {
      openDialog('Сервер и синхронизация', `<p class="x-small">Подключите собственный сервер, чтобы продолжать работу с одним профилем на разных устройствах. Локальная копия сохраняется в браузере.</p><div class="x-form" style="margin-top:16px"><label class="x-field">Адрес сервера<input id="sync-url" type="url" value="${esc(endpoint)}" placeholder="https://atlas.example.com" autocomplete="url"></label><label class="x-field">Ключ доступа<input id="sync-token" type="password" autocomplete="off" placeholder="${token ? 'Ключ уже введён в этой вкладке' : 'Ключ из настроек вашего сервера'}"></label></div><div class="x-note">Ключ действует только до закрытия или перезагрузки вкладки. Он не включается в HTML, JSON или настройки браузера.</div><p id="sync-feedback" class="x-small" role="status">${esc(status)}</p><div class="x-row" style="margin-top:15px"><button class="btn btn-primary" data-sync-action="connect">Проверить подключение</button>${connected || token ? '<button class="btn" data-sync-action="disconnect">Отключить</button>' : ''}<button class="btn" data-sync-action="backup">Скачать локальную копию · JSON</button>${hasBackup() ? '<button class="btn" data-sync-action="download-backup">Копия до загрузки с сервера</button>' : ''}</div><p class="x-small" style="margin-top:15px">На GitHub Pages укажите HTTPS-адрес API на VPS. Сам GitHub Pages хранит только страницу атласа.</p>`, '<button class="btn" data-action="close-dialog">Закрыть</button>');
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
      clearTimeout(timer); connected = false; paused = false;
      endpoint = nextUrl; token = nextToken;
      if (tokenField) tokenField.value = '';
      const attempt = ++generation;
      busy = true; setStatus('Подключение к серверу…');
      try {
        const result = await request('GET');
        if (attempt !== generation) return;
        remote = result; revision = result.revision;
        try { localStorage.setItem(CONFIG, endpoint); } catch {}
        setStatus('Выберите источник данных'); choose();
      } finally { busy = false; }
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
        revision = result.revision; uploaded = version; connected = true; paused = false;
        if (explicit) closeDialog();
        setStatus('Синхронизировано');
      } finally { busy = false; }
      if (changed !== uploaded) schedule();
    }
    function pull() {
      if (busy || !remote?.workspace) return;
      try { localStorage.setItem(BACKUP, JSON.stringify(atlas.read())); }
      catch { throw Error('Не удалось создать локальную резервную копию. Освободите место в хранилище браузера перед загрузкой.'); }
      applying = true;
      try { atlas.replace(remote.workspace); }
      finally { applying = false; }
      changed = uploaded = 0; connected = true; paused = false;
      revision = remote.revision; closeDialog(); setStatus('Синхронизировано');
    }
    function disconnect() {
      ++generation; clearTimeout(timer); connected = false; paused = false; token = ''; remote = null; revision = null;
      setStatus('Локальный режим'); closeDialog();
    }
    function report(error) {
      paused = true;
      if (error.status === 401) { token = ''; connected = false; }
      setStatus(error.status === 409 ? 'Конфликт версий — откройте синхронизацию' : 'Синхронизация приостановлена');
      notify(error.message);
      const el = document.querySelector('#sync-feedback'); if (el) el.textContent = error.message;
    }
    document.addEventListener('atlas:change', () => { if (applying) return; ++changed; schedule(); });
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
    window.addEventListener('online', () => { if (connected && paused && !status.startsWith('Конфликт')) { paused = false; schedule(); } });
    window.addEventListener('beforeunload', event => { if (connected && changed !== uploaded) { event.preventDefault(); event.returnValue = ''; } });
  }, {once:true});
})();
