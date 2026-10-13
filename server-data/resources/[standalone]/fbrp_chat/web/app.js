const chat = document.querySelector('#chat');
const messages = document.querySelector('#messages');
const suggestionsEl = document.querySelector('#suggestions');
const composer = document.querySelector('#composer');
const input = document.querySelector('#input');
const counter = document.querySelector('#counter');

let open = false;
let idleTimer = 0;
let suggestions = [];
let filtered = [];
let selected = 0;
let history = [];
let historyIndex = 0;

const resource = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'fbrp_chat';
const post = (path, body = {}) => fetch(`https://${resource}/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).catch(() => {});

const text = (value) => String(value ?? '');
const validColor = (value) => {
  if (Array.isArray(value)) return `rgb(${value.slice(0, 3).map((n) => Math.max(0, Math.min(255, Number(n) || 0))).join(' ')})`;
  return /^#[0-9a-f]{6}$/i.test(text(value)) ? value : '#69C9FF';
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
  return {
    badge: text(raw.badge || raw.channel || (raw.system ? 'FBRP' : 'CHAT')).toUpperCase().slice(0, 14),
    icon: text(raw.icon || (raw.system ? '◆' : '◌')).slice(0, 2),
    author: text(author).slice(0, 80),
    playerId: raw.playerId ?? raw.id,
    chatTag: raw.chatTag && typeof raw.chatTag === 'object' ? {
      label: text(raw.chatTag.label).slice(0, 40), color: validColor(raw.chatTag.color),
    } : null,
    body: body.slice(0, 1200),
    color: validColor(raw.color),
  };
}

function addMessage(raw) {
  const item = normalize(raw);
  if (!item.body) return;
  const row = document.createElement('article');
  row.className = 'message';
  row.style.setProperty('--accent', item.color);

  const icon = document.createElement('div');
  icon.className = 'message-icon';
  icon.textContent = item.icon;
  const content = document.createElement('div');
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
  content.append(top, body);
  row.append(icon, content);
  messages.append(row);
  while (messages.children.length > 160) messages.firstElementChild.remove();
  messages.scrollTop = messages.scrollHeight;
  wake();
}

function wake() {
  chat.classList.remove('idle');
  clearTimeout(idleTimer);
  if (!open) idleTimer = setTimeout(() => chat.classList.add('idle'), 12000);
}

function setOpen(value) {
  open = Boolean(value);
  chat.classList.toggle('open', open);
  if (open) {
    wake();
    requestAnimationFrame(() => input.focus());
    messages.scrollTop = messages.scrollHeight;
  } else {
    input.blur();
    renderSuggestions();
    idleTimer = setTimeout(() => chat.classList.add('idle'), 12000);
  }
}

function flattenSuggestions(data) {
  const values = Array.isArray(data) ? data : Object.values(data || {});
  suggestions = values.filter((entry) => entry?.name).map((entry) => ({
    name: text(entry.name).startsWith('/') ? text(entry.name) : `/${entry.name}`,
    help: text(entry.help || 'Server command'),
  })).sort((a, b) => a.name.localeCompare(b.name));
  renderSuggestions();
}

function renderSuggestions() {
  const value = input.value.trimStart();
  filtered = !open || !value.startsWith('/') ? [] : suggestions.filter((entry) => entry.name.toLowerCase().startsWith(value.split(/\s/)[0].toLowerCase())).slice(0, 6);
  selected = Math.min(selected, Math.max(0, filtered.length - 1));
  suggestionsEl.replaceChildren();
  suggestionsEl.classList.toggle('has-items', filtered.length > 0);
  filtered.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = `suggestion${index === selected ? ' selected' : ''}`;
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const help = document.createElement('span');
    help.textContent = entry.help;
    row.append(name, help);
    suggestionsEl.append(row);
  });
}

function complete() {
  if (!filtered[selected]) return;
  input.value = `${filtered[selected].name} `;
  input.setSelectionRange(input.value.length, input.value.length);
  counter.textContent = `${input.value.length} / 300`;
  renderSuggestions();
}

input.addEventListener('input', () => {
  counter.textContent = `${input.value.length} / 300`;
  selected = 0;
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
  counter.textContent = '0 / 300';
  post('submit', { message });
});

window.addEventListener('message', ({ data }) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'message') addMessage(data.data);
  else if (data.type === 'open') setOpen(data.value);
  else if (data.type === 'clear') messages.replaceChildren();
  else if (data.type === 'suggestions') flattenSuggestions(data.data);
});

setOpen(false);

