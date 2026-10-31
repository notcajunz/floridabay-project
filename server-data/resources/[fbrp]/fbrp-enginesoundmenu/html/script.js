(() => {
    const $ = (id) => document.getElementById(id);

    const menu = $('menu');
    const header = $('header');
    const nameEl = $('name');
    const countEl = $('count');
    const starEl = $('star');
    const activeEl = $('active');
    const viewTag = $('viewTag');
    const applyEl = $('apply');
    const applyText = $('applyText');
    const arrowLeft = $('arrowLeft');
    const arrowRight = $('arrowRight');

    const IDLE_TEXT = 'ENTER TO APPLY';

    let hideTimer = null;
    let statusTimer = null;
    let lastRender = 0;
    const flashTimers = new Map();

    // everything is sized in "units" that follow the screen height (1px at 1080p)
    function fitScale() {
        const u = Math.max(0.5, window.innerHeight / 1080);
        document.documentElement.style.setProperty('--u', u + 'px');
    }
    window.addEventListener('resize', fitScale);
    fitScale();

    function flash(el, ms) {
        el.classList.add('down');
        clearTimeout(flashTimers.get(el));
        flashTimers.set(el, setTimeout(() => el.classList.remove('down'), ms));
    }

    function resetStatus() {
        clearTimeout(statusTimer);
        applyEl.className = 'apply';
        applyText.textContent = IDLE_TEXT;
    }

    function show(data) {
        clearTimeout(hideTimer);
        if (data.header) header.textContent = data.header;

        const root = document.documentElement.style;
        if (data.right != null) root.setProperty('--right', 'calc(var(--u) * ' + Number(data.right) + ')');
        if (data.bottom != null) root.setProperty('--bottom', 'calc(var(--u) * ' + Number(data.bottom) + ')');

        resetStatus();
        menu.classList.remove('hidden');
        void menu.offsetWidth; // let the transition start from the hidden state
        menu.classList.add('visible');
    }

    function hide() {
        menu.classList.remove('visible');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => menu.classList.add('hidden'), 170);
    }

    function render(d) {
        nameEl.textContent = d.name;
        countEl.textContent = d.index + ' / ' + d.total;
        starEl.hidden = !d.favourite;
        activeEl.hidden = !d.active;
        viewTag.hidden = d.view !== 'fav';

        const now = performance.now();
        const fast = now - lastRender < 90; // skip the slide while scrolling quickly
        lastRender = now;

        nameEl.classList.remove('from-left', 'from-right');
        if (d.dir && !fast) {
            void nameEl.offsetWidth;
            nameEl.classList.add(d.dir > 0 ? 'from-right' : 'from-left');
        }
        if (d.dir > 0) flash(arrowRight, 110);
        if (d.dir < 0) flash(arrowLeft, 110);
    }

    function status(d) {
        clearTimeout(statusTimer);
        applyEl.className = 'apply ' + (d.kind || 'info');
        applyText.textContent = d.text;
        statusTimer = setTimeout(resetStatus, 1500);
    }

    window.addEventListener('message', (e) => {
        const d = e.data || {};
        switch (d.action) {
            case 'show':   show(d); break;
            case 'hide':   hide(); break;
            case 'render': render(d); break;
            case 'status': status(d); break;
            case 'press':  flash(applyEl, 110); break;
        }
    });
})();
