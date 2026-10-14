const panel = document.querySelector('#panel');
const plateEl = document.querySelector('#plate');
const carriedEl = document.querySelector('#carried');
const trunkEl = document.querySelector('#trunk');
const carriedCount = document.querySelector('#carriedCount');
const trunkCount = document.querySelector('#trunkCount');

const resource = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'fbrp_longguns';
const post = (path, body = {}) => fetch(`https://${resource}/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).catch(() => {});

function row(item, actionLabel, onAction) {
  const el = document.createElement('div');
  el.className = 'gun';
  const meta = document.createElement('div');
  meta.className = 'meta';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = String(item.label || item.weapon);
  const sub = document.createElement('div');
  sub.className = 'sub';
  const parts = [];
  if (item.where) parts.push(String(item.where));
  parts.push(`${Number(item.ammo) || 0} rounds`);
  sub.textContent = parts.join(' · ');
  meta.append(name, sub);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = actionLabel;
  button.addEventListener('click', () => { button.disabled = true; onAction(); });
  el.append(meta, button);
  return el;
}

function render(data) {
  plateEl.textContent = String(data.plate || '');
  carriedEl.replaceChildren(...(data.carried || []).map((item) => row(item, 'Stow', () => post('stow', { ref: item.ref }))));
  trunkEl.replaceChildren(...(data.trunk || []).map((item) => row(item, 'Take', () => post('take', { id: item.id }))));
  carriedCount.textContent = `${(data.carried || []).length}`;
  trunkCount.textContent = `${(data.trunk || []).length}/${data.capacity || 0}`;
  panel.hidden = false;
}

window.addEventListener('message', ({ data }) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'open') render(data);
  else if (data.type === 'close') panel.hidden = true;
});

document.querySelector('#close').addEventListener('click', () => post('close'));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.preventDefault(); post('close'); }
});
