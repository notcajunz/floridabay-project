const chat = document.querySelector('#chat');
const messages = document.querySelector('#messages');
const suggestionsEl = document.querySelector('#suggestions');
const composer = document.querySelector('#composer');
const input = document.querySelector('#input');
const counter = document.querySelector('#counter');
const modeEl = document.querySelector('#mode');
const filtersEl = document.querySelector('#filters');

const FADE_AFTER_MS = 11000;
const MAX_MESSAGES = 160;

let open = false;
let suggestions = [];
let filtered = [];
let selected = 0;
let history = [];
let historyIndex = 0;
let activeFilter = 'all';

const resource = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'fbrp_chat';
const post = (path, body = {}) => fetch(`https://${resource}/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).catch(() => {});

const text = (value) => String(value ?? '');
const validColor = (value) => {
  if (Array.isArray(value)) return `rgb(${value.slice(0, 3).map((n) => Math.max(0, Math.min(255, Number(n) || 0))).join(' ')})`;
  return /^#[0-9a-f]{6}$/i.test(text(value)) ? value : '#5cc8ff';
};

function appendRichText(element, value) {
  const source = text(value);
  const url = /https?:\/\/[^\s<]+/gi;
  let cursor = 0;
  for (const match of source.matchAll(url)) {
    element.append(document.createTextNode(source.slice(cursor, match.index)));
    const link = document.createElement('a');
    link.href = match[0];
    link.textContent = match[0];
    link.target = '_blank';
    element.append(link);
    cursor = match.index + match[0].length;
  }
  element.append(document.createTextNode(source.slice(cursor)));
}

function normalize(raw = {}) {
  const args = Array.isArray(raw.args) ? raw.args.map(text) : [];
  const direct = raw.message ?? raw.text;
  const body = direct != null ? text(direct) : args.length > 1 ? args.slice(1).join(' ') : text(args[0]);
  const author = raw.author ?? raw.name ?? (direct == null && args.length > 1 ? args[0] : '');
  const system = Boolean(raw.system);
  return {
    system,
    channel: text(raw.channel || (system ? 'system' : 'ooc')).toLowerCase().replace(/[^a-z]/g, ''),
    badge: text(raw.badge || raw.channel || (system ? 'FBRP' : 'CHAT')).toUpperCase().slice(0, 14),
    author: text(author).slice(0, 80),
    playerId: raw.playerId ?? raw.id,
    chatTag: raw.chatTag && typeof raw.chatTag === 'object' ? {
      label: text(raw.chatTag.label).slice(0, 40), color: validColor(raw.chatTag.color),
    } : null,
    body: body.slice(0, 1200),
    color: validColor(raw.color),
  };
}

function filterMatches(row) {
  if (activeFilter === 'all') return true;
  const channel = row.dataset.channel;
  if (activeFilter === 'system') return row.classList.contains('system');
  return channel === activeFilter;
}

function addMessage(raw) {
  const item = normalize(raw);
  if (!item.body) return;
  const row = document.createElement('article');
  row.className = `message${item.system ? ' system' : ''}`;
  row.dataset.channel = item.channel;
  row.dataset.at = String(Date.now());
  row.style.setProperty('--accent', item.color);
  if (!filterMatches(row)) row.classList.add('filtered');

  const top = document.createElement('div');
  top.className = 'message-top';
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = item.badge;
  top.append(badge);
  if (item.author) {
    const author = document.createElement('span');
    author.className = 'author';
    author.textContent = item.author;
    top.append(author);
  }
  if (item.chatTag?.label) {
    const tag = document.createElement('span');
    tag.className = 'chat-tag';
    tag.style.setProperty('--tag-color', item.chatTag.color);
    tag.textContent = item.chatTag.label;
    top.append(tag);
  }
  if (item.playerId != null) {
    const id = document.createElement('span');
    id.className = 'player-id';
    id.textContent = `#${item.playerId}`;
    top.append(id);
  }
  const time = document.createElement('time');
  time.className = 'time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  top.append(time);

  const body = document.createElement('div');
  body.className = 'message-text';
  appendRichText(body, item.body);
  row.append(top, body);
  messages.append(row);
  while (messages.children.length > MAX_MESSAGES) messages.firstElementChild.remove();
  messages.scrollTop = messages.scrollHeight;
}

// Closed chat: lines age out one at a time. Opening it brings the history back.
setInterval(() => {
  if (open) return;
  const now = Date.now();
  for (const row of messages.children) {
    row.classList.toggle('stale', now - Number(row.dataset.at) > FADE_AFTER_MS);
  }
}, 1000);

function setOpen(value) {
  open = Boolean(value);
  chat.classList.toggle('open', open);
  if (open) {
    requestAnimationFrame(() => input.focus());
    requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
  } else {
    input.blur();
    input.value = '';
    updateMode();
    renderSuggestions();
    const now = Date.now();
    // Lines that were already old fade out immediately, fresh ones keep their timer.
    for (const row of messages.children) row.classList.toggle('stale', now - Number(row.dataset.at) > FADE_AFTER_MS);
    messages.scrollTop = messages.scrollHeight;
  }
}

function flattenSuggestions(data) {
  const values = Array.isArray(data) ? data : Object.values(data || {});
  suggestions = values.filter((entry) => entry?.name).map((entry) => ({
    name: text(entry.name).startsWith('/') ? text(entry.name) : `/${entry.name}`,
    help: text(entry.help || 'Server command'),
    params: Array.isArray(entry.params) ? entry.params.map((p) => text(p?.name)).filter(Boolean) : [],
  })).sort((a, b) => a.name.localeCompare(b.name));
  renderSuggestions();
}

function renderSuggestions() {
  const value = input.value.trimStart();
  filtered = !open || !value.startsWith('/')
    ? []
    : suggestions.filter((entry) => entry.name.toLowerCase().startsWith(value.split(/\s/)[0].toLowerCase())).slice(0, 6);
  selected = Math.min(selected, Math.max(0, filtered.length - 1));
  suggestionsEl.replaceChildren();
  suggestionsEl.classList.toggle('has-items', filtered.length > 0);
  filtered.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = `suggestion${index === selected ? ' selected' : ''}`;
    const name = document.createElement('strong');
    name.textContent = entry.name;
    row.append(name);
    if (entry.params.length) {
      const params = document.createElement('em');
      params.textContent = entry.params.map((p) => `<${p}>`).join(' ');
      row.append(params);
    }
    const help = document.createElement('span');
    help.textContent = entry.help;
    row.append(help);
    suggestionsEl.append(row);
  });
}

function updateMode() {
  const value = input.value.trimStart().toLowerCase();
  const command = value.startsWith('/') ? value.split(/\s/)[0] : '';
  let mode = 'say';
  let label = 'SAY';
  if (command === '/me') { mode = 'me'; label = 'ME'; }
  else if (command === '/do') { mode = 'do'; label = 'DO'; }
  else if (command === '/ooc') { mode = 'ooc'; label = 'OOC'; }
  else if (command) { mode = 'cmd'; label = 'CMD'; }
  modeEl.dataset.mode = mode;
  modeEl.textContent = label;
  const length = input.value.length;
  counter.textContent = length >= 200 ? `${length}/300` : '';
  counter.classList.toggle('warn', length >= 270);
}

function complete() {
  if (!filtered[selected]) return;
  input.value = `${filtered[selected].name} `;
  input.setSelectionRange(input.value.length, input.value.length);
  updateMode();
  renderSuggestions();
}

input.addEventListener('input', () => {
  selected = 0;
  updateMode();
  renderSuggestions();
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.preventDefault(); post('close'); return; }
  if (event.key === 'Tab') { event.preventDefault(); complete(); return; }
  if (event.key === 'ArrowUp' && filtered.length) { event.preventDefault(); selected = (selected - 1 + filtered.length) % filtered.length; renderSuggestions(); return; }
  if (event.key === 'ArrowDown' && filtered.length) { event.preventDefault(); selected = (selected + 1) % filtered.length; renderSuggestions(); return; }
  if (event.key === 'ArrowUp' && !filtered.length && history.length) {
    event.preventDefault(); historyIndex = Math.max(0, historyIndex - 1); input.value = history[historyIndex] || ''; input.dispatchEvent(new Event('input')); return;
  }
  if (event.key === 'ArrowDown' && !filtered.length && history.length) {
    event.preventDefault(); historyIndex = Math.min(history.length, historyIndex + 1); input.value = history[historyIndex] || ''; input.dispatchEvent(new Event('input'));
  }
});

composer.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) { post('close'); return; }
  history = [...history.filter((entry) => entry !== message), message].slice(-30);
  historyIndex = history.length;
  input.value = '';
  updateMode();
  post('submit', { message });
});

filtersEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  activeFilter = button.dataset.filter;
  for (const el of filtersEl.children) el.classList.toggle('active', el === button);
  for (const row of messages.children) row.classList.toggle('filtered', !filterMatches(row));
  messages.scrollTop = messages.scrollHeight;
  input.focus();
});

window.addEventListener('message', ({ data }) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'message') addMessage(data.data);
  else if (data.type === 'open') setOpen(data.value);
  else if (data.type === 'clear') messages.replaceChildren();
  else if (data.type === 'suggestions') flattenSuggestions(data.data);
});

setOpen(false);
