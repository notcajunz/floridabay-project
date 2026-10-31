const VISIBLE = 5;           // rows shown at once, the rest scroll
const ROW_H   = 36;          // row height + gap

const menu     = document.getElementById('menu');
const rowsEl   = document.getElementById('rows');
const viewport = document.getElementById('viewport');
const apply    = document.getElementById('apply');
const countEl  = document.getElementById('count');
let doneTimer, scrollTop = 0;

viewport.style.height = (VISIBLE * ROW_H + 6) + "px";

window.addEventListener('message', (e) => {
    const d = e.data;

    if (d.action === 'open')  { scrollTop = 0; menu.classList.add('open'); }
    if (d.action === 'close') menu.classList.remove('open');

    if (d.action === 'update') {
        const sel = d.selected - 1;

        if (sel < scrollTop) scrollTop = sel;
        if (sel >= scrollTop + VISIBLE) scrollTop = sel - VISIBLE + 1;

        rowsEl.innerHTML = d.rows.map((r, i) => `
            <div class="row ${i === sel ? 'active' : ''}">
                <span class="label">${r.label}</span>
                <span class="control">
                    <span class="arrow">&#8249;</span>
                    <span class="value ${r.dirty ? 'dirty' : ''}">${r.value}%</span>
                    <span class="arrow">&#8250;</span>
                </span>
            </div>`).join('');

        rowsEl.style.transform = `translateY(${-scrollTop * ROW_H}px)`;
        countEl.textContent = `${d.selected} / ${d.rows.length}`;
    }

    if (d.action === 'applied') {
        apply.textContent = 'APPLIED';
        apply.classList.add('done');
        clearTimeout(doneTimer);
        doneTimer = setTimeout(() => {
            apply.textContent = 'ENTER TO APPLY';
            apply.classList.remove('done');
        }, 1200);
    }
});
