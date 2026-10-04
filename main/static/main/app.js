'use strict';

const $ = (id) => document.getElementById(id);
const statuses = {new: 'Новая', in_progress: 'В работе', done: 'Выполнена'};
const tokenKeys = {access: 'task-manager-access', refresh: 'task-manager-refresh'};
let access = sessionStorage.getItem(tokenKeys.access);
let refresh = sessionStorage.getItem(tokenKeys.refresh);
let session = 0;
let refreshPromise = null;
let registering = false;
let authBusy = false;
let page = 1;
let listVersion = 0;
let listController;
let searchTimer;
let editingId = null;
let saving = false;
let tasks = [];
const aiResults = new Map();
const busyTasks = new Set();

class ApiError extends Error {
  constructor(status, data) {
    const detail = typeof data?.detail === 'string' ? data.detail : null;
    super(status === 0 ? 'Не удалось связаться с сервером. Проверьте соединение и повторите действие.' : detail || `Сервер вернул ошибку ${status}. Попробуйте ещё раз.`);
    this.status = status;
    this.data = data;
  }
}

// Единственный повтор — после 401 и успешного обновления JWT.
async function request(url, {method = 'GET', body, protectedRequest = true, signal} = {}) {
  const currentSession = session;
  async function send() {
    let response;
    try {
      response = await fetch(url, {
        method, signal, credentials: 'omit',
        headers: {Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {}),
          ...(protectedRequest && access ? {Authorization: `Bearer ${access}`} : {})},
        ...(body ? {body: JSON.stringify(body)} : {})
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ApiError(0, null);
    }
    let data = null;
    if (response.status !== 204) {
      const raw = await response.text();
      try { data = JSON.parse(raw); } catch { /* HTML ошибки сервера не выводим. */ }
    }
    return {response, data};
  }
  let result = await send();
  if (currentSession !== session) throw new DOMException('Сессия изменилась', 'AbortError');
  if (protectedRequest && result.response.status === 401) {
    if (!refreshPromise) {
      const oldRefresh = refresh;
      refreshPromise = (async () => {
        try {
          if (!oldRefresh) throw new ApiError(401, null);
          const tokens = await request('/api/token/refresh/', {method: 'POST', body: {refresh: oldRefresh}, protectedRequest: false});
          if (!tokens?.access) throw new ApiError(401, null);
          if (currentSession !== session) throw new DOMException('', 'AbortError');
          access = tokens.access;
          sessionStorage.setItem(tokenKeys.access, access);
        } catch (error) {
          if (currentSession === session) logout('Сессия завершилась. Войдите снова.');
          throw error;
        }
      })().finally(() => { if (currentSession === session) refreshPromise = null; });
    }
    await refreshPromise;
    if (currentSession !== session) throw new DOMException('', 'AbortError');
    result = await send();
    if (currentSession !== session) throw new DOMException('', 'AbortError');
    if (result.response.status === 401) logout('Сессия завершилась. Войдите снова.');
  }
  if (!result.response.ok) throw new ApiError(result.response.status, result.data);
  if (result.response.status !== 204 && result.data === null) {
    throw new Error('Сервер вернул неожиданный ответ. Повторите действие.');
  }
  return result.data;
}

function clearErrors(prefix, fields) {
  $(prefix + '-error').textContent = '';
  fields.forEach((field) => {
    $(prefix + '-' + field + '-error').textContent = '';
    $(prefix + '-' + field).removeAttribute('aria-invalid');
  });
}
function showErrors(prefix, fields, error) {
  if (error.name === 'AbortError') return;
  let hasFields = false;
  fields.forEach((field) => {
    const messages = error.data?.[field];
    if (messages) {
      $(prefix + '-' + field + '-error').textContent = Array.isArray(messages) ? messages.join(' ') : String(messages);
      $(prefix + '-' + field).setAttribute('aria-invalid', 'true');
      hasFields = true;
    }
  });
  const general = error.data?.non_field_errors;
  $(prefix + '-error').textContent = general ? (Array.isArray(general) ? general.join(' ') : String(general)) : hasFields ? 'Проверьте отмеченные поля.' : error.message;
  if (prefix === 'auth' && !registering && error.status === 401) {
    $('auth-error').textContent = 'Неверное имя пользователя или пароль.';
  }
}
function setAuthMode(register) {
  registering = register;
  $('auth-title').textContent = register ? 'Регистрация' : 'Вход';
  $('auth-submit').textContent = register ? 'Создать аккаунт' : 'Войти';
  $('email-field').hidden = !register;
  $('auth-email').disabled = !register;
  $('auth-email').required = register;
  $('auth-password').autocomplete = register ? 'new-password' : 'current-password';
  $('show-login').setAttribute('aria-pressed', String(!register));
  $('show-register').setAttribute('aria-pressed', String(register));
  $('auth-notice').textContent = '';
  clearErrors('auth', ['username', 'email', 'password']);
}
function logout(message = '') {
  session++;
  access = refresh = null;
  refreshPromise = null;
  Object.values(tokenKeys).forEach((key) => sessionStorage.removeItem(key));
  listVersion++;
  listController?.abort();
  clearTimeout(searchTimer);
  tasks = [];
  aiResults.clear();
  busyTasks.clear();
  $('tasks').replaceChildren();
  $('username').textContent = '';
  $('account').hidden = $('workspace').hidden = true;
  $('auth').hidden = false;
  $('task-dialog').close();
  $('task-form').reset();
  $('auth-form').reset();
  $('filters').reset();
  page = 1;
  setAuthMode(false);
  $('auth-notice').textContent = message;
  $('auth-username').focus();
}
async function openWorkspace() {
  const user = await request('/api/me/');
  $('username').textContent = user.username;
  $('auth').hidden = true;
  $('workspace').hidden = $('account').hidden = false;
  await loadTasks();
}
$('show-login').onclick = () => setAuthMode(false);
$('show-register').onclick = () => setAuthMode(true);
$('logout').onclick = () => logout();
$('auth-form').onsubmit = async (event) => {
  event.preventDefault();
  if (authBusy) return;
  authBusy = true;
  const wasRegistering = registering;
  const currentSession = session;
  ['auth-submit', 'show-login', 'show-register'].forEach((id) => { $(id).disabled = true; });
  clearErrors('auth', ['username', 'email', 'password']);
  const body = {username: $('auth-username').value.trim(), password: $('auth-password').value};
  if (wasRegistering) body.email = $('auth-email').value.trim();
  try {
    const result = await request(wasRegistering ? '/api/register/' : '/api/token/', {method: 'POST', body, protectedRequest: false});
    if (currentSession !== session) return;
    $('auth-password').value = '';
    if (wasRegistering) {
      setAuthMode(false);
      $('auth-notice').textContent = 'Аккаунт создан. Войдите с вашим именем пользователя и паролем.';
      $('auth-password').focus();
    } else {
      if (!result?.access || !result?.refresh) throw new Error('Сервер не вернул токены входа.');
      access = result.access;
      refresh = result.refresh;
      sessionStorage.setItem(tokenKeys.access, access);
      sessionStorage.setItem(tokenKeys.refresh, refresh);
      await openWorkspace();
    }
  } catch (error) {
    showErrors('auth', ['username', 'email', 'password'], error);
    if (access && $('workspace').hidden) logout('Не удалось открыть аккаунт. Попробуйте войти снова.');
  } finally {
    authBusy = false;
    ['auth-submit', 'show-login', 'show-register'].forEach((id) => { $(id).disabled = false; });
  }
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function renderTasks() {
  if ($('tasks').getAttribute('aria-busy') === 'true') return;
  $('tasks').replaceChildren();
  for (const task of tasks) {
    const card = element('article', 'task-card');
    const top = element('div', 'task-top');
    top.append(element('h2', 'task-title', task.title), element('span', `badge ${Object.hasOwn(statuses, task.status) ? task.status : ''}`, statuses[task.status] || task.status));
    card.append(top, element('p', 'description', task.description));
    const date = element('time', 'task-date', `Создана ${new Date(task.created_at).toLocaleString('ru-RU', {dateStyle: 'medium', timeStyle: 'short'})}`);
    date.dateTime = task.created_at;
    card.append(date);
    const actions = element('div', 'task-actions');
    function action(label, className, handler, disabled = false) {
      const button = element('button', className, label);
      button.type = 'button';
      button.disabled = disabled || busyTasks.has(task.id);
      button.onclick = handler;
      actions.append(button);
    }
    action('Редактировать', 'secondary', () => openTask(task));
    action('Завершить', 'secondary', () => mutateTask(task, 'complete'), task.status === 'done');
    action('Удалить', 'danger', () => {
      if (confirm(`Удалить задачу «${task.title}»?`)) mutateTask(task, 'delete');
    });
    const ai = aiResults.get(task.id);
    action(ai?.loading ? 'AI составляет шаги…' : 'Разбить на шаги с AI', 'secondary', () => breakdown(task), ai?.loading);
    card.append(actions);
    const output = element('div', 'ai-result');
    output.setAttribute('aria-live', 'polite');
    if (ai?.loading) output.append(element('p', 'muted', 'Составляем план действий…'));
    if (ai?.error) output.append(element('p', 'error', ai.error));
    if (ai?.steps) {
      output.append(element('strong', '', 'План действий'));
      const list = element('ol');
      ai.steps.forEach((step) => list.append(element('li', '', step)));
      output.append(list, element('p', 'ai-note', 'Шаги не сохраняются после обновления страницы'));
    }
    card.append(output);
    if (task.error) card.append(element('p', 'error', task.error));
    $('tasks').append(card);
  }
}
async function loadTasks() {
  clearTimeout(searchTimer);
  const version = ++listVersion;
  listController?.abort();
  listController = new AbortController();
  const params = new URLSearchParams({page, ordering: $('ordering').value});
  if ($('search').value.trim()) params.set('search', $('search').value.trim());
  if ($('filter-status').value) params.set('status', $('filter-status').value);
  $('list-message').className = '';
  $('list-message').textContent = 'Загружаем задачи…';
  $('retry-list').hidden = true;
  $('pagination').hidden = true;
  tasks = [];
  $('tasks').replaceChildren();
  $('tasks').setAttribute('aria-busy', 'true');
  try {
    const data = await request(`/api/tasks/?${params}`, {signal: listController.signal});
    if (version !== listVersion) return;
    if (!Array.isArray(data?.results)) throw new Error('Неожиданный формат списка задач.');
    if (!data.results.length && page > 1) { page--; return loadTasks(); }
    tasks = data.results;
    $('tasks').setAttribute('aria-busy', 'false');
    renderTasks();
    $('list-message').textContent = tasks.length ? `Найдено задач: ${data.count}` : 'Задач пока нет. Создайте задачу или измените условия поиска.';
    $('pagination').hidden = !(data.next || data.previous);
    $('previous').disabled = !data.previous;
    $('next').disabled = !data.next;
    $('page-label').textContent = `Страница ${page}`;
  } catch (error) {
    if (version !== listVersion || error.name === 'AbortError' || $('workspace').hidden) return;
    // После удаления последней записи DRF может ответить 404 для старой страницы.
    if (error.status === 404 && page > 1) { page--; return loadTasks(); }
    $('list-message').className = 'error';
    $('list-message').textContent = error.message;
    $('retry-list').hidden = false;
  } finally {
    if (version === listVersion) $('tasks').setAttribute('aria-busy', 'false');
  }
}
function filtersChanged(delay = 0) {
  page = 1;
  listVersion++;
  listController?.abort();
  clearTimeout(searchTimer);
  $('tasks').replaceChildren();
  $('pagination').hidden = true;
  $('list-message').textContent = 'Загружаем задачи…';
  tasks = [];
  $('tasks').setAttribute('aria-busy', 'true');
  searchTimer = setTimeout(loadTasks, delay);
}
$('filters').onsubmit = (event) => { event.preventDefault(); filtersChanged(); };
$('search').oninput = () => filtersChanged(300);
$('filter-status').onchange = $('ordering').onchange = () => filtersChanged();
$('previous').onclick = () => { page--; loadTasks(); };
$('next').onclick = () => { page++; loadTasks(); };
$('retry-list').onclick = () => loadTasks();

function openTask(task = null) {
  editingId = task?.id ?? null;
  $('task-form').reset();
  clearErrors('task', ['title', 'description', 'status']);
  $('dialog-title').textContent = task ? 'Редактирование задачи' : 'Новая задача';
  if (task) {
    $('task-title').value = task.title;
    $('task-description').value = task.description;
    $('task-status').value = task.status;
  }
  $('task-dialog').showModal();
  $('task-title').focus();
}
function closeDialog() { if (!saving) $('task-dialog').close(); }
$('create-task').onclick = () => openTask();
$('close-dialog').onclick = $('cancel-task').onclick = closeDialog;
$('task-dialog').oncancel = (event) => { if (saving) event.preventDefault(); };
$('task-form').onsubmit = async (event) => {
  event.preventDefault();
  if (saving) return;
  saving = true;
  const currentSession = session;
  ['save-task', 'cancel-task', 'close-dialog'].forEach((id) => { $(id).disabled = true; });
  clearErrors('task', ['title', 'description', 'status']);
  const body = {title: $('task-title').value.trim(), description: $('task-description').value.trim(), status: $('task-status').value};
  try {
    await request(editingId === null ? '/api/tasks/' : `/api/tasks/${editingId}/`, {method: editingId === null ? 'POST' : 'PATCH', body});
    if (session !== currentSession) return;
    if (editingId === null) page = 1;
    else aiResults.delete(editingId);
    $('task-dialog').close();
    await loadTasks();
  } catch (error) {
    if (session === currentSession) showErrors('task', ['title', 'description', 'status'], error);
  } finally {
    saving = false;
    ['save-task', 'cancel-task', 'close-dialog'].forEach((id) => { $(id).disabled = false; });
  }
};
async function mutateTask(task, action) {
  if (busyTasks.has(task.id)) return;
  const currentSession = session;
  busyTasks.add(task.id);
  delete task.error;
  renderTasks();
  try {
    await request(`/api/tasks/${task.id}/${action === 'complete' ? 'complete/' : ''}`, {method: action === 'complete' ? 'POST' : 'DELETE'});
    if (session !== currentSession) return;
    if (action === 'delete') aiResults.delete(task.id);
    await loadTasks();
  } catch (error) {
    if (session === currentSession && error.name !== 'AbortError') { task.error = error.message; }
  } finally {
    if (session === currentSession) { busyTasks.delete(task.id); renderTasks(); }
  }
}
async function breakdown(task) {
  if (aiResults.get(task.id)?.loading) return;
  const currentSession = session;
  const result = {loading: true};
  aiResults.set(task.id, result);
  renderTasks();
  try {
    const data = await request(`/api/tasks/${task.id}/ai-breakdown/`, {method: 'POST'});
    if (!Array.isArray(data?.steps) || !data.steps.length || !data.steps.every((step) => typeof step === 'string')) {
      throw new Error('AI вернул некорректные шаги. Попробуйте ещё раз.');
    }
    result.steps = data.steps;
  } catch (error) {
    const messages = {502: 'AI вернул некорректный ответ. Попробуйте ещё раз.', 503: 'AI сейчас недоступен. Попробуйте позже.', 504: 'AI не успел ответить. Попробуйте ещё раз.'};
    result.error = messages[error.status] || error.message;
  } finally {
    result.loading = false;
    if (session === currentSession && aiResults.get(task.id) === result) renderTasks();
  }
}

if (access || refresh) {
  $('auth').hidden = true;
  openWorkspace().catch((error) => {
    if (error.name !== 'AbortError' && $('workspace').hidden) logout('Не удалось восстановить сессию. Войдите снова.');
  });
}
