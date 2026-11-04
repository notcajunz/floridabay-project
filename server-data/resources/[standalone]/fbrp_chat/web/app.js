(() => {
  const $ = (s) => document.querySelector(s);
  const chat = $('#chat'), list = $('#messages'), wrap = $('#inputWrap'), input = $('#input'), sugBox = $('#suggest');
  const res = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'fbrp_chat';
  const post = (name, body) => fetch(`https://${res}/${name}`, { method: 'POST', body: JSON.stringify(body || {}) }).catch(() => {});

  let cfg = { fade: 12, max: 80, serverName: 'Florida Bay Roleplay' };
  let suggestions = [];
  let history = [], hIndex = -1, sel = 0, fadeTimer = null, isOpen = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const strip = (s) => String(s ?? '').replace(/~[a-zA-Z]~/g, '').replace(/\^[0-9]/g, '');
  // role badges: [{ text: '[Admin]', color: '#ff0000' }, ...]
  const badgesHtml = (m) => {
    const list = (Array.isArray(m.badges) ? m.badges : []).filter((b) => b && String(b.text || '').trim() !== '');
    if (!list.length) return '';
    return `<span class="badges">${list.map((b) => `<span class="badge" style="--bc:${esc(b.color || '#fff')}">${esc(strip(String(b.text).trim()))}</span>`).join('')}</span>`;
  };

  function wake() {
    chat.classList.add('active');
    clearTimeout(fadeTimer);
    if (!isOpen) fadeTimer = setTimeout(() => chat.classList.remove('active'), cfg.fade * 1000);
  }

  function applySeason() {
    if (window.ChatSeason) window.ChatSeason.apply(cfg, document.getElementById('chatFx'), [...document.querySelectorAll('.season-ic')]);
  }

  const isIM = () => document.body.classList.contains('theme-imessage');
  let lastKey = null;

  function addBubble(m) {
    const tag = m.tag || 'SYSTEM';
    const author = strip(m.author || '');
    const key = `${tag}|${author}|${m.mine ? 1 : 0}`;
    const el = document.createElement('div');
    if (tag === 'SYSTEM' && !m.mine) {
      el.className = 'im sys';
      el.innerHTML = `<span class="sys-text">${m.author && m.author !== cfg.serverName ? `<b>${esc(author)}</b> ` : ''}${esc(strip(m.text))}</span>`;
      lastKey = null;
    } else {
      const grouped = key === lastKey;
      el.className = `im ${m.mine ? 'mine' : 'theirs'} ${tag}${grouped ? ' grouped' : ''}`;
      if (m.color) el.style.setProperty('--c', m.color);
      const head = grouped ? '' : `<span class="who"><i class="dot"></i>${esc(m.label || tag)}${badgesHtml(m) ? ` · ${badgesHtml(m)}` : ''}${author ? ` · ${esc(author)}` : ''}</span>`;
      el.innerHTML = `${head}<span class="bubble">${esc(strip(m.text))}</span>`;
      if (grouped && list.lastElementChild) list.lastElementChild.classList.add('cont');
      lastKey = key;
    }
    list.appendChild(el);
    if (m.mine) {
      list.querySelectorAll('.delivered').forEach((d) => d.remove());
      const d = document.createElement('div');
      d.className = 'delivered';
      d.textContent = 'Delivered';
      list.appendChild(d);
    }
    while (list.children.length > cfg.max) list.firstChild.remove();
    list.scrollTop = list.scrollHeight;
    wake();
  }

  const ICONS = {
    gear: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>',
  };

  function addMessage(m) {
    if (isIM()) return addBubble(m);
    const el = document.createElement('div');
    el.className = `msg ${m.tag || ''}${m.tint ? ' tint' : ''}`;
    if (m.color) el.style.setProperty('--c', m.color);
    const min = document.body.classList.contains('theme-minimal');
    el.innerHTML = `${ICONS[m.icon] ? `<span class="ico">${ICONS[m.icon]}</span>` : ''}${m.label ? `<span class="tag">${min ? '[' : ''}${esc(m.label)}${min ? ']' : ''}</span>` : ''}${badgesHtml(m)}${m.author ? `<span class="author">${esc(strip(m.author))}${m.tag === 'ME' ? '' : ':'}</span>` : ''}<span class="text">${esc(strip(m.text))}</span>`;
    list.appendChild(el);
    while (list.children.length > cfg.max) list.firstChild.remove();
    list.scrollTop = list.scrollHeight;
    wake();
  }

  function renderSuggestions() {
    const v = input.value;
    if (!v.startsWith('/')) { sugBox.innerHTML = ''; return; }
    const [cmd, ...rest] = v.split(' ');
    const typingArgs = v.includes(' ');
    const matches = suggestions
      .filter((s) => typingArgs ? s.name === cmd : s.name.startsWith(cmd))
      .slice(0, 6);
    if (sel >= matches.length) sel = 0;
    sugBox.innerHTML = matches.map((s, i) => {
      const params = (s.params || []).map((p, pi) => `<span class="p${typingArgs && pi === rest.length - 1 ? ' cur' : ''}">[${esc(p.name)}]</span>`).join('');
      return `<div class="sug${i === sel && !typingArgs ? ' sel' : ''}"><b>${esc(s.name)}</b>${params}${s.help ? `<span class="h">${esc(s.help)}</span>` : ''}</div>`;
    }).join('');
    sugBox._matches = matches;
  }

  function open() {
    if (isOpen) { refocus(); return; }
    isOpen = true;
    chat.classList.add('open', 'active');
    clearTimeout(fadeTimer);
    wrap.classList.remove('hidden');
    input.value = '';
    wrap.classList.remove('typing');
    hIndex = -1;
    renderSuggestions();
    setTimeout(() => input.focus(), 10);
  }

  function close(submit) {
    const text = input.value.trim();
    isOpen = false;
    wrap.classList.add('hidden');
    chat.classList.remove('open');
    input.blur();
    if (submit && text) {
      history.unshift(text);
      history = history.slice(0, 30);
      post('submit', { text });
    } else post('close');
    wake();
  }

  function refocus() {
    if (!isOpen) return;
    if (document.activeElement !== input) {
      input.focus();
      const n = input.value.length;
      try { input.setSelectionRange(n, n); } catch (_) {}
    }
  }

  function forceClose() {
    isOpen = false;
    wrap.classList.add('hidden');
    chat.classList.remove('open');
    input.blur();
    wake();
  }

  window.addEventListener('focus', () => setTimeout(refocus, 30));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(refocus, 30); });
  window.addEventListener('mousedown', () => setTimeout(refocus, 0));
  window.addEventListener('keydown', (e) => {
    if (!isOpen || e.target === input) return;
    if (e.key === 'Enter') { e.preventDefault(); close(true); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      input.value += e.key;
      renderSuggestions();
    }
    refocus();
  });

  input.addEventListener('input', () => { sel = 0; renderSuggestions(); wrap.classList.toggle('typing', input.value.trim() !== ''); });
  input.addEventListener('keydown', (e) => {
    const matches = sugBox._matches || [];
    if (e.key === 'Enter') { e.preventDefault(); close(true); }
    else if (e.key === 'Escape') { e.preventDefault(); close(false); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      if (matches[sel] && !input.value.includes(' ')) { input.value = matches[sel].name + ' '; renderSuggestions(); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length > 1 && !input.value.includes(' ') && input.value.startsWith('/')) { sel = (sel - 1 + matches.length) % matches.length; renderSuggestions(); }
      else if (history.length) { hIndex = Math.min(hIndex + 1, history.length - 1); input.value = history[hIndex]; renderSuggestions(); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (matches.length > 1 && !input.value.includes(' ') && input.value.startsWith('/')) { sel = (sel + 1) % matches.length; renderSuggestions(); }
      else if (hIndex > 0) { hIndex--; input.value = history[hIndex]; renderSuggestions(); }
      else { hIndex = -1; input.value = ''; renderSuggestions(); }
    } else if (e.key === 'PageUp') { list.scrollTop -= 120; }
    else if (e.key === 'PageDown') { list.scrollTop += 120; }
  });

  window.addEventListener('message', (e) => {
    const { action, data } = e.data || {};
    switch (action) {
      case 'config':
        cfg = { ...cfg, ...(data || {}) };
        document.body.classList.toggle('theme-imessage', cfg.style === 'imessage');
        document.body.classList.toggle('theme-minimal', cfg.style === 'minimal');
        if (cfg.style === 'minimal') input.placeholder = '';
        if (cfg.style === 'imessage') input.placeholder = 'iMessage';
        applySeason();
        if (data && data.top) chat.style.top = String(data.top);
        if (data && data.background != null) document.documentElement.style.setProperty('--msg-bg', String(Math.max(0, Math.min(1, Number(data.background) || 0))));
        if (data && data.theme && data.theme.accent) {
          const a = data.theme.accent;
          document.documentElement.style.setProperty('--accent', a);
          const h = String(a).replace('#', '');
          const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
          if (!isNaN(n)) document.documentElement.style.setProperty('--accent-rgb', `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`);
        }
        if (data && data.placeholder && cfg.style !== 'minimal' && cfg.style !== 'imessage') input.placeholder = data.placeholder;
        break;
      case 'visibility':
        // 0 = show when active (fades), 1 = always show, 2 = always hide (from /toggleChat or the L key)
        document.body.classList.toggle('chat-always', data === 1);
        document.body.classList.toggle('chat-hidden', data === 2);
        break;
      case 'message': addMessage(data || {}); break;
      case 'suggestions': suggestions = Object.values(data || {}).sort((a, b) => a.name.localeCompare(b.name)); if (isOpen) renderSuggestions(); break;
      case 'open': open(); break;
      case 'forceClose': forceClose(); break;
      case 'clear': list.innerHTML = ''; break;
    }
  });

  if (window.invokeNative) post('loaded');

  if (!window.invokeNative) {
    document.body.classList.add('preview');
    const qs = new URLSearchParams(location.search);
    const st = qs.get('style') || 'minimal';
    cfg.style = st;
    if (st === 'imessage') { document.body.classList.add('theme-imessage'); input.placeholder = 'iMessage'; }
    if (st === 'minimal') { document.body.classList.add('theme-minimal'); input.placeholder = ''; }
    cfg.season = qs.get('season') || 'auto';
    cfg.seasons = [
      { theme: 'halloween', from: '10-25', to: '11-01' }, { theme: 'thanksgiving', from: '11-02', to: '11-30' }, { theme: 'christmas', from: '12-01', to: '12-26' },
      { theme: 'valentine', from: '02-08', to: '02-15' }, { theme: 'winter', from: '12-27', to: '03-19' }, { theme: 'july4', from: '06-28', to: '07-05' },
      { theme: 'spring', from: '03-20', to: '06-20' }, { theme: 'summer', from: '06-21', to: '09-21' }, { theme: 'autumn', from: '09-22', to: '10-24' },
    ];
    applySeason();
    suggestions = [
      { name: '/me', help: 'Describe what your character does', params: [{ name: 'action' }] },
      { name: '/mechanic', help: '', params: [] },
      { name: '/multijob', help: 'Switch jobs', params: [] },
    ];
    [
      { tag: 'SYSTEM', label: 'FBRP', author: 'Florida Bay Roleplay', text: 'Welcome to Florida Bay Roleplay. Type /help for commands.', color: '#F59E0B' },
      { tag: 'ME', label: 'ME', author: 'Marcus Vale', text: 'checks his watch and looks down Vinewood Blvd', color: '#C084FC' },
      { tag: 'DO', label: 'DO', author: 'Marcus Vale', text: 'The taxi pulls up to the curb', color: '#34D399' },
      { tag: 'OOC', label: 'OOC', author: '(1) Jake Miller', text: 'brb grabbing water', color: '#60A5FA', mine: true },
      { tag: 'OOC', label: 'OOC', author: '(1) Jake Miller', text: 'back', color: '#60A5FA', mine: true },
      { tag: 'AD', label: 'AD', author: "Advertisement | Tony Russo", text: "Russo's Deli open in Paleto Bay — best subs in Blaine County!", color: '#FBBF24' },
      { tag: 'OOC', label: 'OOC', author: '(4) Nova', text: 'Anyone know where the DMV is?', color: '#60A5FA' },
      { tag: 'OOC', label: 'OOC', badges: [{ text: '[Admin]', color: '#E03232' }], author: '(2) Sarah Cole', text: 'welcome to Florida Bay everyone', color: '#60A5FA' },
    ].forEach(addMessage);
    open();
    input.value = '/m';
    renderSuggestions();
  }
})();
